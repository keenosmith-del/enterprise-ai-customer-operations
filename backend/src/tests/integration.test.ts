import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { app } from "../app.js";
import { config } from "../config.js";
import { seed } from "../../prisma/seed.js";
import { RabbitBroker } from "../messaging/rabbitmq.js";
import { publishOutbox } from "../messaging/outbox.js";
import {
  handleDelivery,
  recoverJobs,
  claimJob,
} from "../services/processing.js";
import { closeOperations } from "../services/operations.js";
import { createCase, reprocessCase } from "../services/cases.js";
import { replayJob } from "../services/jobs.js";
import {
  newVersion,
  editVersion,
  activateVersion,
} from "../services/prompts.js";
import {
  startEvaluation,
  evaluationDetail,
  compareRuns,
} from "../services/evaluations.js";
const broker = new RabbitBroker();
let timer: ReturnType<typeof setInterval>,
  running = false,
  paused = false;
const active = new Set<Promise<void>>();
async function waitFor<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeout = 30000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`Condition not met: ${JSON.stringify(value!)}`);
}
const body = {
  customerName: "Integration operator",
  customerEmail: "integration@example.test",
  subject: "Duplicate invoice",
  description: "I was charged twice on my invoice.",
  source: "Integration test",
};
async function completed(id: string) {
  return waitFor(
    () => db.customerCase.findUniqueOrThrow({ where: { id } }),
    (c) => ["Processed", "Review", "Failed"].includes(c.status),
  );
}
beforeAll(async () => {
  await db.$connect();
  await seed();
  await broker.connect();
  await broker.consume((delivery) => {
    const promise = handleDelivery(delivery, "integration-worker");
    active.add(promise);
    void promise.finally(() => active.delete(promise)).catch(() => {});
    return promise;
  });
  timer = setInterval(() => {
    if (running || paused) return;
    running = true;
    void publishOutbox(broker)
      .catch(() => {})
      .finally(() => {
        running = false;
      });
  }, 50);
  await waitFor(
    () => db.outboxEvent.count({ where: { publishedAt: null } }),
    (n) => n === 0,
  );
}, 60000);
afterAll(async () => {
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  await Promise.allSettled([...active]);
  await broker.close();
  await closeOperations();
  await db.$disconnect();
});
describe("real PostgreSQL + RabbitMQ workflow", () => {
  it("validates API and persists a queued case before inference", async () => {
    await request(app).post("/api/cases").send(body).expect(401);
    await request(app)
      .post("/api/cases")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    await request(app)
      .post("/api/cases")
      .send({ ...body, description: "x".repeat(70000) })
      .expect(413);
    await request(app)
      .post("/api/cases")
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send({ ...body, customerEmail: "invalid" })
      .expect(400);
    const response = await request(app)
      .post("/api/cases")
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send(body)
      .expect(201);
    expect(response.body.status).toBe("New");
    const job = await db.processingJob.findFirstOrThrow({
      where: { caseId: response.body.id },
      include: { outbox: true },
    });
    expect(job.outbox).toHaveLength(1);
    const item = await completed(response.body.id);
    expect(item.category).toBe("Billing");
    expect(item.team).toBe("Finance");
    expect(item.response).toBeTruthy();
    const durable = await db.processingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(durable.state).toBe("Succeeded");
    expect((durable.result as any).simulated).toBe(true);
    const dashboard = await request(app).get("/api/dashboard").expect(200);
    expect(dashboard.body.total).toBeGreaterThan(0);
    expect(dashboard.body.provider.simulated).toBe(true);
  });
  it("handles duplicate real broker deliveries without duplicate result or attempt", async () => {
    const item = await createCase(body, randomUUID());
    await completed(item.id);
    const job = await db.processingJob.findFirstOrThrow({
      where: { caseId: item.id },
    });
    const event = {
      eventId: randomUUID(),
      jobId: job.id,
      schemaVersion: 1 as const,
      correlationId: "duplicate",
    };
    await Promise.all([broker.publish(event), broker.publish(event)]);
    // A sentinel behind duplicate deliveries gives a deterministic broker consumption barrier.
    const sentinel = await createCase(
      { ...body, subject: "Sentinel invoice" },
      randomUUID(),
    );
    await completed(sentinel.id);
    expect(await db.processingAttempt.count({ where: { jobId: job.id } })).toBe(
      1,
    );
    expect(
      await db.caseEvent.count({
        where: { caseId: item.id, type: "AI recommendation" },
      }),
    ).toBe(1);
  });
  it("records durable review, corrections, approval and resolution with concurrency checks", async () => {
    const item = await createCase(body, randomUUID());
    let current = await completed(item.id);
    const review = {
      action: "correct",
      category: "Account Management",
      priority: "High",
      response: "Human-edited draft for review.",
      operator: "Test operator",
      updatedAt: current.updatedAt.toISOString(),
    };
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send({ ...review, action: "resolve" })
      .expect(409);
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send(review)
      .expect(200);
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send(review)
      .expect(409);
    current = await db.customerCase.findUniqueOrThrow({
      where: { id: item.id },
    });
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send({
        ...review,
        action: "approve",
        updatedAt: current.updatedAt.toISOString(),
      })
      .expect(200);
    current = await db.customerCase.findUniqueOrThrow({
      where: { id: item.id },
    });
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send({
        ...review,
        action: "resolve",
        updatedAt: current.updatedAt.toISOString(),
      })
      .expect(200);
    const detail = await request(app).get(`/api/cases/${item.id}`).expect(200);
    expect(detail.body.status).toBe("Resolved");
    expect(detail.body.response).toBe(review.response);
    expect(detail.body.reviews).toHaveLength(3);
    expect(detail.body.jobs[0].result.output.category).toBe("Billing");
    await expect(reprocessCase(item.id, "blocked")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("preserves escalated routing when an operator approves an unchanged classification", async () => {
    const item = await createCase(
      {
        ...body,
        subject: "Immediate safety concern",
        description:
          "There is an immediate safety concern requiring human attention.",
      },
      "review-routing",
    );
    const current = await completed(item.id);
    expect(current.team).toBe("Escalations");
    await request(app)
      .post(`/api/cases/${item.id}/reviews`)
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .send({
        action: "approve",
        category: current.category,
        priority: current.priority,
        response: "Human-approved escalation draft.",
        operator: "Test operator",
        updatedAt: current.updatedAt.toISOString(),
      })
      .expect(200);
    expect(
      (await db.customerCase.findUniqueOrThrow({ where: { id: item.id } }))
        .team,
    ).toBe("Escalations");
  });
  it("versions/evaluates/compares/activates real persisted prompts and uses them at runtime", async () => {
    const template = await db.promptTemplate.findUniqueOrThrow({
      where: { kind: "classification" },
      include: { versions: { where: { active: true } } },
    });
    const response = await db.promptTemplate.findUniqueOrThrow({
      where: { kind: "response" },
      include: { versions: { where: { active: true } } },
    });
    const version = await newVersion(template.id, {
      content: template.versions[0].content + "\nUse concise summaries.",
    });
    await editVersion(version.id, {
      content: version.content + "\nPreserve all schema fields.",
    });
    await expect(
      activateVersion(version.id, { operator: "Test operator" }),
    ).rejects.toMatchObject({ status: 409 });
    const dataset = await db.evaluationDataset.findFirstOrThrow();
    const first = await startEvaluation(
      { datasetId: dataset.id, promptId: template.versions[0].id },
      "eval-first",
    );
    const second = await startEvaluation(
      { datasetId: dataset.id, promptId: version.id },
      "eval-second",
    );
    await waitFor(
      () => evaluationDetail(first.id),
      (r) => r.status === "Completed",
    );
    const result = await waitFor(
      () => evaluationDetail(second.id),
      (r) => r.status === "Completed",
    );
    expect(result.results).toHaveLength(36);
    expect((result.metrics as any).count).toBe(36);
    expect((result.metrics as any).inputTokens).toBeNull();
    expect((result.metrics as any).classificationAccuracy).toBeLessThan(1); // independent security category label challenges keyword simulation
    expect(
      (await compareRuns(first.id, second.id)).delta.classificationAccuracy,
    ).toBe(0);
    await expect(
      editVersion(version.id, { content: version.content }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      activateVersion(version.id, { operator: "Test operator" }),
    ).rejects.toMatchObject({ status: 409 }); // simulated scores are not quality validation
    await activateVersion(version.id, {
      operator: "Test operator",
      overrideReason:
        "Local demonstration only; deterministic provider cannot validate LLM quality",
    });
    const brief = await newVersion(response.id, {
      content: response.versions[0].content + "\nKeep the response brief.",
    });
    await activateVersion(brief.id, {
      operator: "Test operator",
      overrideReason: "Local demonstration of prompt version control only",
    });
    const item = await createCase(body, "new-active");
    const current = await completed(item.id);
    const job = await db.processingJob.findFirstOrThrow({
      where: { caseId: item.id },
    });
    expect(job.classificationPromptId).toBe(version.id);
    expect(job.responsePromptId).toBe(brief.id);
    expect(current.response).toBe(
      "Thank you for contacting us. Our billing team can review your request.",
    );
  });
  it("records a transient failure then succeeds exactly once", async () => {
    const item = await createCase(body, "transient");
    await completed(item.id);
    const job = await reprocessCase(item.id, "transient-test", "transient");
    await waitFor(
      () => db.processingJob.findUniqueOrThrow({ where: { id: job.id } }),
      (j) => j.state === "Succeeded",
    );
    const attempts = await db.processingAttempt.findMany({
      where: { jobId: job.id },
      orderBy: { number: "asc" },
    });
    expect(attempts.map((a) => a.status)).toEqual(["Failed", "Succeeded"]);
    expect(
      await db.caseEvent.count({
        where: { caseId: item.id, type: "AI recommendation" },
      }),
    ).toBe(2); // original + reprocess; no duplicate retry result
  });
  it("exhausts permanent failures, archives dead letter, and safely replays a new job", async () => {
    const item = await createCase(body, "permanent");
    await completed(item.id);
    const job = await reprocessCase(item.id, "permanent-test", "permanent");
    await waitFor(
      () => db.processingJob.findUniqueOrThrow({ where: { id: job.id } }),
      (j) => j.state === "Failed",
    );
    expect(
      await db.processingAttempt.count({
        where: { jobId: job.id, status: "Failed" },
      }),
    ).toBe(config.MAX_ATTEMPTS);
    await waitFor(
      () =>
        db.outboxEvent.findFirst({
          where: {
            jobId: job.id,
            destination: "dead",
            publishedAt: { not: null },
          },
        }),
      (e) => !!e,
    );
    expect((await broker.health()).deadLettered).toBeGreaterThan(0);
    const replay = await replayJob(job.id, "replay-test");
    await waitFor(
      () => db.processingJob.findUniqueOrThrow({ where: { id: replay.id } }),
      (j) => j.state === "Succeeded",
    );
    expect(replay.replayOf).toBe(job.id);
    expect(replay.simulation).toBeNull();
    await expect(replayJob(job.id, "duplicate-replay")).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      replayJob(replay.id, "successful-replay"),
    ).rejects.toMatchObject({ status: 409 });
    await request(app).get("/api/operations").expect(401);
    const ops = await request(app)
      .get("/api/operations")
      .set("X-Operator-Token", config.ADMIN_TOKEN)
      .expect(200);
    expect(ops.body.counts.Failed).toBeGreaterThan(0);
  });
  it("preserves unconfirmed outbox events and recovers a crashed worker lease", async () => {
    paused = true;
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
    const item = await createCase(
      { ...body, subject: "Outbox recovery invoice" },
      "outbox",
    );
    const job = await db.processingJob.findFirstOrThrow({
      where: { caseId: item.id },
    });
    await expect(
      publishOutbox({
        publish: async () => {
          throw new Error("broker unavailable");
        },
      } as any),
    ).rejects.toThrow();
    const pending = await db.outboxEvent.findFirstOrThrow({
      where: { jobId: job.id },
    });
    expect(pending.publishedAt).toBeNull();
    expect(pending.error).toBeTruthy();
    const claim = await claimJob(job.id, "crashed-owner", "crashed-worker");
    expect(claim?.attempt).toBe(1);
    await db.processingJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await recoverJobs();
    paused = false;
    const done = await waitFor(
      () => db.processingJob.findUniqueOrThrow({ where: { id: job.id } }),
      (j) => j.state === "Succeeded",
    );
    expect(done.attempt).toBe(2);
    expect(
      await db.caseEvent.count({
        where: { caseId: item.id, type: "AI recommendation" },
      }),
    ).toBe(1);
  });
  it("is repeatably seeded without duplicate examples or reset active versions", async () => {
    const before = await db.evaluationExample.count();
    const active = await db.promptVersion.findMany({ where: { active: true } });
    await seed();
    expect(await db.evaluationExample.count()).toBe(before);
    expect(
      (await db.promptVersion.findMany({ where: { active: true } }))
        .map((v) => v.id)
        .sort(),
    ).toEqual(active.map((v) => v.id).sort());
  });
});
