import { z } from "zod";
import { db } from "../db.js";
import { config } from "../config.js";
import { validateTemplate } from "../ai/schema.js";
import { HttpError } from "../middleware/errors.js";
export const draftInput = z
  .object({ content: z.string().min(80).max(20000) })
  .strict();
export const activationInput = z
  .object({
    operator: z.string().min(2).max(100),
    overrideReason: z.string().trim().min(10).max(1000).optional(),
  })
  .strict();
function valid(content: string, kind: string) {
  try {
    validateTemplate(content, kind);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}
export async function listPrompts() {
  const templates = await db.promptTemplate.findMany({
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: {
          runs: { orderBy: { createdAt: "desc" }, take: 5 },
          responseRuns: { orderBy: { createdAt: "desc" }, take: 5 },
          activations: { orderBy: { createdAt: "desc" } },
        },
      },
    },
    orderBy: { kind: "asc" },
  });
  return templates.map((template) => ({
    ...template,
    versions: template.versions.map((version) => ({
      ...version,
      runs: template.kind === "response" ? version.responseRuns : version.runs,
    })),
  }));
}
export async function newVersion(templateId: string, input: unknown) {
  const { content } = draftInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PromptTemplate" WHERE id = ${templateId}::uuid FOR UPDATE`;
    const template = await tx.promptTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!template) throw new HttpError(404, "Prompt template not found");
    valid(content, template.kind);
    return tx.promptVersion.create({
      data: {
        templateId,
        content,
        version: (template.versions[0]?.version ?? 0) + 1,
      },
    });
  });
}
export async function editVersion(id: string, input: unknown) {
  const { content } = draftInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PromptVersion" WHERE id = ${id}::uuid FOR UPDATE`;
    const version = await tx.promptVersion.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!version) throw new HttpError(404, "Version not found");
    if (
      version.publishedAt ||
      (await tx.evaluationRun.count({
        where: { OR: [{ promptId: id }, { responsePromptId: id }] },
      })) ||
      (await tx.processingJob.count({
        where: {
          OR: [{ classificationPromptId: id }, { responsePromptId: id }],
        },
      }))
    )
      throw new HttpError(
        409,
        "Published or evaluated versions are immutable; create a new draft",
      );
    valid(content, version.template.kind);
    return tx.promptVersion.update({ where: { id }, data: { content } });
  });
}
export async function activateVersion(id: string, input: unknown) {
  const { operator, overrideReason } = activationInput.parse(input);
  return db.$transaction(async (tx) => {
    const initial = await tx.promptVersion.findUnique({ where: { id } });
    if (!initial) throw new HttpError(404, "Version not found");
    await tx.$queryRaw`SELECT id FROM "PromptTemplate" WHERE id = ${initial.templateId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PromptVersion" WHERE id = ${id}::uuid FOR UPDATE`;
    const version = await tx.promptVersion.findUniqueOrThrow({
      where: { id },
      include: {
        template: true,
        runs: {
          where: { status: "Completed", simulated: false },
          orderBy: { completedAt: "desc" },
        },
      },
    });
    valid(version.content, version.template.kind);
    const runs =
      version.template.kind === "classification"
        ? version.runs
        : await tx.evaluationRun.findMany({
            where: {
              responsePromptId: id,
              status: "Completed",
              simulated: false,
            },
            orderBy: { completedAt: "desc" },
          });
    const passed = runs.some((r) => {
      const m = r.metrics as Record<string, number> | null;
      return (
        m &&
        m.classificationAccuracy >= config.QUALITY_GATE_ACCURACY &&
        m.schemaCompliance >= config.QUALITY_GATE_SCHEMA
      );
    });
    if (!passed && !overrideReason)
      throw new HttpError(
        409,
        "No passing real-provider evaluation. Supply an explicit override reason to activate; demo scores do not satisfy the quality gate.",
      );
    await tx.promptVersion.updateMany({
      where: { templateId: version.templateId, active: true },
      data: { active: false },
    });
    const updated = await tx.promptVersion.update({
      where: { id },
      data: {
        active: true,
        publishedAt: version.publishedAt ?? new Date(),
        activationOverride: passed ? null : overrideReason,
      },
    });
    await tx.promptActivation.create({
      data: {
        promptId: id,
        operator,
        overrideReason: passed ? null : overrideReason,
      },
    });
    return updated;
  });
}
