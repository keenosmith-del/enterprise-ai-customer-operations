import { randomUUID } from "node:crypto";
import type { ProcessingJob, Prisma } from "@prisma/client";
import { db } from "../db.js";
import { config } from "../config.js";
import { provider, ProviderError, type Inference } from "../ai/providers.js";
import { score } from "../evaluation/scoring.js";
import { outbox } from "./jobs.js";
import type { Delivery } from "../messaging/contract.js";
import { log } from "../middleware/errors.js";
export const retryDelay = (attempt: number) =>
  config.RETRY_BASE_MS * 2 ** (attempt - 1);
const leaseMs = 120000;
export async function claimJob(id: string, owner: string, worker: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${id}::uuid FOR UPDATE`;
    const job = await tx.processingJob.findUnique({ where: { id } });
    if (!job || ["Succeeded", "Failed"].includes(job.state)) return null;
    if (job.state === "Processing" || job.nextAttemptAt > new Date())
      return null; // recovery loop owns expired leases
    if (job.attempt >= config.MAX_ATTEMPTS) return null;
    const next = await tx.processingJob.update({
      where: { id },
      data: {
        state: "Processing",
        attempt: { increment: 1 },
        leaseOwner: owner,
        leaseUntil: new Date(Date.now() + leaseMs),
      },
    });
    await tx.processingAttempt.create({
      data: { jobId: id, number: next.attempt, worker, status: "Processing" },
    });
    if (job.caseId) {
      await tx.customerCase.update({
        where: { id: job.caseId },
        data: { status: "Processing" },
      });
      await tx.caseEvent.create({
        data: {
          caseId: job.caseId,
          type: "Processing",
          message: `Attempt ${next.attempt} started`,
          metadata: { jobId: id, worker, promptId: job.classificationPromptId },
        },
      });
    }
    if (job.evaluationId)
      await tx.evaluationRun.update({
        where: { id: job.evaluationId },
        data: { status: "Running" },
      });
    return next;
  });
}
async function owned(tx: Prisma.TransactionClient, job: ProcessingJob) {
  await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${job.id}::uuid FOR UPDATE`;
  const current = await tx.processingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  if (
    current.state !== "Processing" ||
    current.leaseOwner !== job.leaseOwner ||
    !current.leaseUntil ||
    current.leaseUntil < new Date()
  )
    throw new Error("Worker lease lost");
}
async function processCase(
  job: ProcessingJob,
  classificationPrompt: string,
  responsePrompt: string,
) {
  const item = await db.customerCase.findUniqueOrThrow({
    where: { id: job.caseId! },
  });
  const inference = await provider.infer(
    { subject: item.subject, description: item.description },
    classificationPrompt,
    responsePrompt,
  );
  await db.$transaction(async (tx) => {
    await owned(tx, job);
    await tx.customerCase.update({
      where: { id: item.id },
      data: {
        ...inference.output,
        status: inference.output.reviewRequired ? "Review" : "Processed",
      },
    });
    await tx.caseEvent.create({
      data: {
        caseId: item.id,
        type: "AI recommendation",
        message: inference.simulated
          ? "Simulated recommendation persisted; no external model used"
          : "Validated model recommendation persisted",
        metadata: inference as unknown as Prisma.InputJsonValue,
      },
    });
    await finish(tx, job, inference);
  });
}
async function processEvaluation(
  job: ProcessingJob,
  classificationPrompt: string,
  responsePrompt: string,
) {
  const run = await db.evaluationRun.findUniqueOrThrow({
    where: { id: job.evaluationId! },
    include: {
      dataset: { include: { examples: { orderBy: { key: "asc" } } } },
    },
  });
  // Configuration drift must not mix providers in one run after a restart.
  if (run.provider !== provider.name || run.model !== provider.model)
    throw new ProviderError(
      "Evaluation provider changed; restore original provider configuration",
      "configuration",
    );
  for (const example of run.dataset.examples) {
    if (
      await db.evaluationResult.findUnique({
        where: { runId_exampleId: { runId: run.id, exampleId: example.id } },
      })
    )
      continue;
    const start = performance.now();
    let inference: Inference | undefined,
      error: string | null = null;
    try {
      inference = await provider.infer(
        { subject: example.subject, description: example.description },
        classificationPrompt,
        responsePrompt,
      );
    } catch (e) {
      error =
        e instanceof ProviderError
          ? `${e.category}: ${e.message}`
          : "Inference failed";
    }
    await db.$transaction(async (tx) => {
      await owned(tx, job);
      await tx.evaluationResult.create({
        data: {
          runId: run.id,
          exampleId: example.id,
          output: inference?.output as unknown as
            Prisma.InputJsonValue | undefined,
          schemaValid: !!inference,
          categoryCorrect:
            inference?.output.category === example.expectedCategory,
          priorityCorrect:
            inference?.output.priority === example.expectedPriority,
          latencyMs:
            inference?.latencyMs ?? Math.round(performance.now() - start),
          inputTokens: inference?.inputTokens,
          outputTokens: inference?.outputTokens,
          cost: inference?.cost,
          error,
        },
      });
    });
  }
  const results = await db.evaluationResult.findMany({
    where: { runId: run.id },
    include: { example: true },
  });
  const metrics = score(
    results.map((r) => ({
      ...r,
      expectedCategory: r.example.expectedCategory,
      predictedCategory:
        (r.output as { category?: string } | null)?.category ?? null,
    })),
  );
  await db.$transaction(async (tx) => {
    await owned(tx, job);
    await tx.evaluationRun.update({
      where: { id: run.id },
      data: { status: "Completed", completedAt: new Date(), metrics },
    });
    await finish(tx, job, {
      metrics,
      provider: provider.name,
      model: provider.model,
      simulated: provider.simulated,
    });
  });
}
async function finish(
  tx: Prisma.TransactionClient,
  job: ProcessingJob,
  result: unknown,
) {
  await tx.processingJob.update({
    where: { id: job.id },
    data: {
      state: "Succeeded",
      leaseUntil: null,
      leaseOwner: null,
      error: null,
      result: result as Prisma.InputJsonValue,
    },
  });
  const attempt = await tx.processingAttempt.findUniqueOrThrow({
    where: { jobId_number: { jobId: job.id, number: job.attempt } },
  });
  await tx.processingAttempt.update({
    where: { jobId_number: { jobId: job.id, number: job.attempt } },
    data: {
      status: "Succeeded",
      completedAt: new Date(),
      durationMs: Math.max(0, Date.now() - attempt.startedAt.getTime()),
    },
  });
}
async function fail(
  tx: Prisma.TransactionClient,
  job: ProcessingJob,
  message: string,
  category: string,
) {
  const terminal = job.attempt >= config.MAX_ATTEMPTS;
  const due = new Date(Date.now() + retryDelay(job.attempt));
  await tx.processingJob.update({
    where: { id: job.id },
    data: {
      state: terminal ? "Failed" : "Retrying",
      error: message,
      leaseUntil: null,
      leaseOwner: null,
      nextAttemptAt: due,
    },
  });
  const attempt = await tx.processingAttempt.findUniqueOrThrow({
    where: { jobId_number: { jobId: job.id, number: job.attempt } },
  });
  await tx.processingAttempt.updateMany({
    where: { jobId: job.id, number: job.attempt, status: "Processing" },
    data: {
      status: "Failed",
      error: message,
      errorCategory: category,
      completedAt: new Date(),
      durationMs: Math.max(0, Date.now() - attempt.startedAt.getTime()),
    },
  });
  // A durable hand-off in the same transaction: only then may the original broker delivery be acknowledged.
  await outbox(
    tx,
    job.id,
    job.correlationId,
    terminal ? "dead" : "work",
    terminal ? new Date() : due,
  );
  if (job.caseId) {
    await tx.customerCase.update({
      where: { id: job.caseId },
      data: { status: terminal ? "Failed" : "New" },
    });
    await tx.caseEvent.create({
      data: {
        caseId: job.caseId,
        type: terminal ? "Failed" : "Retry scheduled",
        message: `Attempt ${job.attempt}: ${message}${terminal ? "" : `; next attempt at ${due.toISOString()}`}`,
        metadata: { jobId: job.id, errorCategory: category },
      },
    });
  }
  if (terminal && job.evaluationId)
    await tx.evaluationRun.update({
      where: { id: job.evaluationId },
      data: { status: "Failed", completedAt: new Date() },
    });
}
export async function handleDelivery(delivery: Delivery, worker: string) {
  const owner = randomUUID();
  const job = await claimJob(delivery.event.jobId, owner, worker);
  if (!job) {
    await delivery.ack();
    return;
  }
  const start = performance.now();
  const renewal = setInterval(() => {
    void db.processingJob
      .updateMany({
        where: { id: job.id, state: "Processing", leaseOwner: owner },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      })
      .catch(() => {
        log({ jobId: job.id, errorCategory: "lease_renewal" });
      });
  }, 30000);
  try {
    if (
      config.NODE_ENV !== "production" &&
      (job.simulation === "permanent" ||
        (job.simulation === "transient" && job.attempt === 1))
    )
      throw new ProviderError(
        "Development simulated processing failure",
        "simulation",
      );
    const [classification, response] = await Promise.all([
      db.promptVersion.findUniqueOrThrow({
        where: { id: job.classificationPromptId },
      }),
      db.promptVersion.findUniqueOrThrow({
        where: { id: job.responsePromptId },
      }),
    ]);
    if (job.kind === "case")
      await processCase(job, classification.content, response.content);
    else await processEvaluation(job, classification.content, response.content);
    await delivery.ack();
    log({
      type: "processed",
      eventId: delivery.event.eventId,
      caseId: job.caseId,
      evaluationId: job.evaluationId,
      correlationId: job.correlationId,
      worker,
      attempt: job.attempt,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    const category =
      error instanceof ProviderError ? error.category : "processing";
    const message =
      error instanceof ProviderError
        ? error.message
        : "Processing failed or worker lease lost";
    // If a commit succeeded but ack failed, completion remains authoritative; never overwrite it with failure.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${job.id}::uuid FOR UPDATE`;
      const current = await tx.processingJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (current.state === "Processing" && current.leaseOwner === owner)
        await fail(tx, current, message, category);
    });
    await delivery.ack();
    log({
      level: "error",
      eventId: delivery.event.eventId,
      caseId: job.caseId,
      evaluationId: job.evaluationId,
      correlationId: job.correlationId,
      worker,
      attempt: job.attempt,
      errorCategory: category,
      durationMs: Math.round(performance.now() - start),
    });
  } finally {
    clearInterval(renewal);
  }
}
export async function recoverJobs() {
  const expired = await db.processingJob.findMany({
    where: { state: "Processing", leaseUntil: { lt: new Date() } },
    take: 100,
  });
  for (const candidate of expired)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const job = await tx.processingJob.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      if (
        job.state === "Processing" &&
        job.leaseUntil &&
        job.leaseUntil < new Date()
      )
        await fail(
          tx,
          job,
          "Worker stopped before durable completion",
          "worker_lost",
        );
    });
  // Recovers broker-native max-delivery DLQ, lost settlements and early duplicate acknowledgements.
  const outstanding = await db.processingJob.findMany({
    where: {
      state: { in: ["Queued", "Retrying"] },
      nextAttemptAt: { lte: new Date() },
      updatedAt: { lt: new Date(Date.now() - 120000) },
    },
    take: 100,
  });
  for (const candidate of outstanding)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const job = await tx.processingJob.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { outbox: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!["Queued", "Retrying"].includes(job.state)) return;
      const last = job.outbox[0];
      if (
        !last ||
        (last.publishedAt && last.publishedAt < new Date(Date.now() - 120000))
      ) {
        await outbox(tx, job.id, job.correlationId);
        await tx.processingJob.update({
          where: { id: job.id },
          data: { updatedAt: new Date() },
        });
      }
    });
}
