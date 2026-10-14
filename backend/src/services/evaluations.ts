import { z } from "zod";
import { db } from "../db.js";
import { provider } from "../ai/providers.js";
import { activePrompts, enqueue } from "./jobs.js";
import { HttpError } from "../middleware/errors.js";
const runInput = z
  .object({
    datasetId: z.string().uuid(),
    promptId: z.string().uuid(),
    responsePromptId: z.string().uuid().optional(),
  })
  .strict();
export async function startEvaluation(input: unknown, correlationId: string) {
  const data = runInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PromptVersion" WHERE id = ${data.promptId}::uuid FOR UPDATE`;
    const prompt = await tx.promptVersion.findUnique({
      where: { id: data.promptId },
      include: { template: true },
    });
    if (!prompt || prompt.template.kind !== "classification")
      throw new HttpError(400, "Select a classification prompt");
    const dataset = await tx.evaluationDataset.findUnique({
      where: { id: data.datasetId },
      include: { _count: { select: { examples: true } } },
    });
    if (!dataset || !dataset._count.examples)
      throw new HttpError(400, "Dataset must have examples");
    const active = await activePrompts(tx);
    const responseId = data.responsePromptId ?? active.response.id;
    await tx.$queryRaw`SELECT id FROM "PromptVersion" WHERE id = ${responseId}::uuid FOR UPDATE`;
    const response = await tx.promptVersion.findUnique({
      where: { id: responseId },
      include: { template: true },
    });
    if (!response || response.template.kind !== "response")
      throw new HttpError(400, "Select a response prompt");
    const run = await tx.evaluationRun.create({
      data: {
        datasetId: data.datasetId,
        promptId: prompt.id,
        responsePromptId: responseId,
        provider: provider.name,
        model: provider.model,
        simulated: provider.simulated,
      },
    });
    await enqueue(tx, {
      kind: "evaluation",
      evaluationId: run.id,
      classificationPromptId: prompt.id,
      responsePromptId: responseId,
      correlationId,
    });
    return run;
  });
}
export const listEvaluations = () =>
  db.evaluationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      prompt: { include: { template: true } },
      dataset: true,
      _count: { select: { results: true } },
    },
  });
export async function evaluationDetail(id: string) {
  const run = await db.evaluationRun.findUnique({
    where: { id },
    include: {
      prompt: true,
      dataset: { include: { _count: { select: { examples: true } } } },
      results: {
        include: { example: true },
        orderBy: { example: { key: "asc" } },
      },
      jobs: { include: { attempts: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!run) throw new HttpError(404, "Evaluation not found");
  return run;
}
export async function compareRuns(a: string, b: string) {
  const [baseline, candidate] = await Promise.all([
    evaluationDetail(a),
    evaluationDetail(b),
  ]);
  if (baseline.status !== "Completed" || candidate.status !== "Completed")
    throw new HttpError(409, "Both runs must be completed");
  if (baseline.datasetId !== candidate.datasetId)
    throw new HttpError(400, "Compare runs on the same dataset");
  const keys = [
    "classificationAccuracy",
    "priorityAccuracy",
    "macroF1",
    "schemaCompliance",
    "meanLatencyMs",
  ];
  const before = baseline.metrics as Record<string, number>,
    after = candidate.metrics as Record<string, number>;
  return {
    baseline,
    candidate,
    delta: Object.fromEntries(keys.map((k) => [k, after[k] - before[k]])),
    regressions: candidate.results.filter((r) => {
      const old = baseline.results.find((p) => p.exampleId === r.exampleId);
      return (
        old &&
        ((old.categoryCorrect && !r.categoryCorrect) ||
          (old.priorityCorrect && !r.priorityCorrect) ||
          (old.schemaValid && !r.schemaValid))
      );
    }),
  };
}
