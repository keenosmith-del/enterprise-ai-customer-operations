import { z } from "zod";
import { db } from "../db.js";
import { activePrompts, enqueue } from "./jobs.js";
import { categories, priorities, routing } from "../ai/schema.js";
import { HttpError } from "../middleware/errors.js";
export const caseInput = z
  .object({
    customerName: z.string().trim().min(2).max(120),
    customerEmail: z.string().email().max(254),
    subject: z.string().trim().min(4).max(200),
    description: z.string().trim().min(10).max(15000),
    source: z.string().trim().min(1).max(80).default("Web"),
  })
  .strict();
export const reviewInput = z
  .object({
    action: z.enum(["accept", "correct", "approve", "resolve"]),
    category: z.enum(categories),
    priority: z.enum(priorities),
    response: z.string().trim().min(1).max(10000),
    operator: z.string().trim().min(2).max(100),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const caseFilters = z.object({
  search: z.string().max(200).default(""),
  status: z
    .enum([
      "New",
      "Processing",
      "Review",
      "Processed",
      "Approved",
      "Resolved",
      "Failed",
    ])
    .optional(),
  category: z.enum(categories).optional(),
  priority: z.enum(priorities).optional(),
  sort: z.enum(["newest", "oldest", "updated"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export async function createCase(input: unknown, correlationId: string) {
  const data = caseInput.parse(input);
  return db.$transaction(async (tx) => {
    const prompts = await activePrompts(tx);
    const item = await tx.customerCase.create({ data });
    await tx.caseEvent.create({
      data: {
        caseId: item.id,
        type: "Created",
        message: "Customer request received; durable processing event recorded",
      },
    });
    await enqueue(tx, {
      kind: "case",
      caseId: item.id,
      classificationPromptId: prompts.classification.id,
      responsePromptId: prompts.response.id,
      correlationId,
    });
    return item;
  });
}
export async function listCases(query: unknown) {
  const filters = caseFilters.parse(query);
  const where = {
    status: filters.status,
    category: filters.category,
    priority: filters.priority,
    ...(filters.search
      ? {
          OR: ["subject", "customerName", "customerEmail", "description"].map(
            (field) => ({
              [field]: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            }),
          ),
        }
      : {}),
  };
  const [items, total] = await db.$transaction([
    db.customerCase.findMany({
      where,
      orderBy:
        filters.sort === "updated"
          ? { updatedAt: "desc" }
          : { createdAt: filters.sort === "oldest" ? "asc" : "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.customerCase.count({ where }),
  ]);
  return { items, total, page: filters.page, pageSize: filters.pageSize };
}
export async function caseDetail(id: string) {
  const item = await db.customerCase.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      reviews: { orderBy: { createdAt: "desc" } },
      jobs: {
        orderBy: { createdAt: "desc" },
        include: { attempts: { orderBy: { number: "asc" } } },
      },
    },
  });
  if (!item) throw new HttpError(404, "Case not found");
  const ids = item.jobs.flatMap((j) => [
    j.classificationPromptId,
    j.responsePromptId,
  ]);
  const prompts = await db.promptVersion.findMany({
    where: { id: { in: ids } },
    include: { template: true },
  });
  return { ...item, prompts };
}
export async function reviewCase(id: string, input: unknown) {
  const data = reviewInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerCase" WHERE id = ${id}::uuid FOR UPDATE`;
    const item = await tx.customerCase.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Case not found");
    if (["New", "Processing", "Failed", "Resolved"].includes(item.status))
      throw new HttpError(
        409,
        "Case must have a completed recommendation and be open for review",
      );
    if (item.updatedAt.toISOString() !== data.updatedAt)
      throw new HttpError(
        409,
        "Case changed; refresh before saving your review",
      );
    if (data.action === "resolve" && item.status !== "Approved")
      throw new HttpError(
        409,
        "Approve a recommendation before resolving the case",
      );
    const status =
      data.action === "resolve"
        ? "Resolved"
        : data.action === "approve"
          ? "Approved"
          : "Processed";
    const after = {
      category: data.category,
      priority: data.priority,
      response: data.response,
      team:
        data.category === item.category
          ? (item.team ?? routing[data.category])
          : routing[data.category],
      reviewRequired: false,
      reviewReason: null,
      status,
    };
    await tx.caseReview.create({
      data: {
        caseId: id,
        operator: data.operator,
        action: data.action,
        before: {
          category: item.category,
          priority: item.priority,
          response: item.response,
          status: item.status,
        },
        after,
      },
    });
    await tx.caseEvent.create({
      data: {
        caseId: id,
        type: "Human review",
        message: `${data.operator}: ${data.action}. Draft retained; no customer message sent.`,
      },
    });
    return tx.customerCase.update({ where: { id }, data: after });
  });
}
export async function reprocessCase(
  id: string,
  correlationId: string,
  simulation?: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerCase" WHERE id = ${id}::uuid FOR UPDATE`;
    const item = await tx.customerCase.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Case not found");
    if (
      ["New", "Processing", "Resolved"].includes(item.status) ||
      (await tx.processingJob.findFirst({
        where: {
          caseId: id,
          state: { in: ["Queued", "Retrying", "Processing"] },
        },
      }))
    )
      throw new HttpError(409, "Case is resolved or already queued");
    const prompts = await activePrompts(tx);
    await tx.customerCase.update({ where: { id }, data: { status: "New" } });
    await tx.caseEvent.create({
      data: {
        caseId: id,
        type: "Reprocess",
        message: simulation
          ? `Development failure simulation: ${simulation}`
          : "Operator requested processing with active prompts",
      },
    });
    return enqueue(tx, {
      kind: "case",
      caseId: id,
      classificationPromptId: prompts.classification.id,
      responsePromptId: prompts.response.id,
      correlationId,
      simulation,
    });
  });
}
