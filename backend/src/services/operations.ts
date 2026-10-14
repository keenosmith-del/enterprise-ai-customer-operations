import { db } from "../db.js";
import { provider } from "../ai/providers.js";
import { createBroker } from "../messaging/index.js";
import { config } from "../config.js";
let broker = createBroker();
let checking: Promise<{
  connected: boolean;
  queued: number | null;
  deadLettered: number | null;
}> | null = null;
export function brokerHealth() {
  if (checking) return checking;
  checking = (async () => {
    try {
      if (!(await broker.health()).connected) {
        await broker.close().catch(() => {});
        broker = createBroker();
        await broker.connect();
      }
      return await broker.health();
    } catch {
      return { connected: false, queued: null, deadLettered: null };
    } finally {
      checking = null;
    }
  })();
  return checking;
}
export const closeOperations = () => broker.close();
export async function health() {
  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    /* status is intentionally false */
  }
  const messaging = await brokerHealth();
  const workers = database
    ? await db.workerHeartbeat.findMany({
        where: { lastSeen: { gte: new Date(Date.now() - 15000) } },
      })
    : [];
  return {
    api: true,
    database,
    messaging,
    messagingProvider: config.MESSAGING_PROVIDER,
    workers,
    workerHealthy: workers.length > 0,
    provider: {
      name: provider.name,
      model: provider.model,
      simulated: provider.simulated,
    },
  };
}
export async function dashboard() {
  const [
    statuses,
    total,
    failedJobs,
    latency,
    recentCases,
    events,
    failures,
    prompts,
    evaluations,
  ] = await Promise.all([
    db.customerCase.groupBy({ by: ["status"], _count: true }),
    db.customerCase.count(),
    db.processingJob.count({ where: { state: "Failed" } }),
    db.processingAttempt.aggregate({
      where: { status: "Succeeded", job: { kind: "case" } },
      _avg: { durationMs: true },
    }),
    db.customerCase.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    db.caseEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { case: { select: { subject: true } } },
    }),
    db.processingAttempt.findMany({
      where: { status: "Failed" },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    db.promptVersion.findMany({
      where: { active: true },
      include: { template: true },
    }),
    db.evaluationRun.findMany({
      where: { status: "Completed" },
      orderBy: { completedAt: "desc" },
      take: 3,
      include: { prompt: true },
    }),
  ]);
  const counts = Object.fromEntries(statuses.map((s) => [s.status, s._count]));
  return {
    total,
    counts,
    failedJobs,
    averageProcessingLatencyMs: latency._avg.durationMs,
    provider: {
      name: provider.name,
      model: provider.model,
      simulated: provider.simulated,
    },
    classificationAccuracy:
      (evaluations[0]?.metrics as Record<string, number> | null)
        ?.classificationAccuracy ?? null,
    accuracySimulated: evaluations[0]?.simulated ?? null,
    recentCases,
    events,
    failures,
    prompts,
    evaluations,
  };
}
export async function operations() {
  const [status, counts, jobs, events, outboxPending, outboxErrors] =
    await Promise.all([
      health(),
      db.processingJob.groupBy({ by: ["state"], _count: true }),
      db.processingJob.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          attempts: { orderBy: { number: "asc" } },
          case: { select: { subject: true } },
          evaluation: { select: { id: true } },
        },
      }),
      db.caseEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      db.outboxEvent.count({ where: { publishedAt: null } }),
      db.outboxEvent.findMany({
        where: { publishedAt: null, error: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);
  return {
    health: status,
    counts: Object.fromEntries(counts.map((c) => [c.state, c._count])),
    jobs,
    events,
    outboxPending,
    outboxErrors,
    simulationEnabled: config.NODE_ENV !== "production",
    retryPolicy: {
      maxAttempts: config.MAX_ATTEMPTS,
      baseMs: config.RETRY_BASE_MS,
    },
  };
}
