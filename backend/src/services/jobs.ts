import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { HttpError } from "../middleware/errors.js";
import type { JobEvent } from "../messaging/contract.js";
export type Transaction = Prisma.TransactionClient;
export async function activePrompts(tx: Transaction = db) {
  const prompts = await tx.promptVersion.findMany({
    where: { active: true },
    include: { template: true },
  });
  const classification = prompts.find(
      (p) => p.template.kind === "classification",
    ),
    response = prompts.find((p) => p.template.kind === "response");
  if (!classification || !response)
    throw new HttpError(503, "Seed active prompts before processing cases");
  return { classification, response };
}
export async function enqueue(
  tx: Transaction,
  data: {
    kind: "case" | "evaluation";
    caseId?: string;
    evaluationId?: string;
    classificationPromptId: string;
    responsePromptId: string;
    correlationId: string;
    simulation?: string;
    replayOf?: string;
  },
) {
  const job = await tx.processingJob.create({ data });
  await outbox(tx, job.id, job.correlationId);
  return job;
}
export async function outbox(
  tx: Transaction,
  jobId: string,
  correlationId: string,
  destination = "work",
  availableAt = new Date(),
) {
  const id = randomUUID();
  const payload: JobEvent = {
    eventId: id,
    jobId,
    schemaVersion: 1,
    correlationId,
  };
  return tx.outboxEvent.create({
    data: { id, jobId, payload, destination, availableAt },
  });
}
export async function replayJob(jobId: string, correlationId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${jobId}::uuid FOR UPDATE`;
    const old = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!old) throw new HttpError(404, "Job not found");
    if (old.state !== "Failed")
      throw new HttpError(409, "Only failed jobs can be replayed");
    if (await tx.processingJob.findFirst({ where: { replayOf: jobId } }))
      throw new HttpError(
        409,
        "This attempt has already been replayed; replay its failed successor instead",
      );
    if (old.caseId) {
      await tx.$queryRaw`SELECT id FROM "CustomerCase" WHERE id = ${old.caseId}::uuid FOR UPDATE`;
      const item = await tx.customerCase.findUniqueOrThrow({
        where: { id: old.caseId },
      });
      if (
        item.status === "Resolved" ||
        (await tx.processingJob.findFirst({
          where: {
            caseId: old.caseId,
            state: { in: ["Queued", "Retrying", "Processing"] },
          },
        }))
      )
        throw new HttpError(409, "Case is resolved or already processing");
      await tx.customerCase.update({
        where: { id: old.caseId },
        data: { status: "New" },
      });
      await tx.caseEvent.create({
        data: {
          caseId: old.caseId,
          type: "Human replay",
          message: `Failed job ${jobId} replayed by local operator`,
        },
      });
    }
    if (old.evaluationId)
      await tx.evaluationRun.update({
        where: { id: old.evaluationId },
        data: { status: "Queued", completedAt: null },
      });
    return enqueue(tx, {
      kind: old.kind as "case" | "evaluation",
      caseId: old.caseId ?? undefined,
      evaluationId: old.evaluationId ?? undefined,
      classificationPromptId: old.classificationPromptId,
      responsePromptId: old.responsePromptId,
      correlationId,
      replayOf: old.id,
    });
  });
}
