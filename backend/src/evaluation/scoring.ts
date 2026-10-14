import { categories } from "../ai/schema.js";
export type ScoredResult = {
  expectedCategory: string;
  predictedCategory: string | null;
  categoryCorrect: boolean;
  priorityCorrect: boolean;
  schemaValid: boolean;
  latencyMs: number;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
};
export function score(results: ScoredResult[]) {
  const n = results.length;
  const perClass = categories.map((category) => {
    const tp = results.filter(
      (r) =>
        r.expectedCategory === category && r.predictedCategory === category,
    ).length;
    const fp = results.filter(
      (r) =>
        r.expectedCategory !== category && r.predictedCategory === category,
    ).length;
    const fn = results.filter(
      (r) =>
        r.expectedCategory === category && r.predictedCategory !== category,
    ).length;
    const precision = tp + fp ? tp / (tp + fp) : 0,
      recall = tp + fn ? tp / (tp + fn) : 0;
    return {
      category,
      support: tp + fn,
      precision,
      recall,
      f1:
        precision + recall
          ? (2 * precision * recall) / (precision + recall)
          : 0,
    };
  });
  const total = (key: "inputTokens" | "outputTokens" | "cost") =>
    n && results.every((r) => r[key] !== null)
      ? results.reduce((a, r) => a + (r[key] ?? 0), 0)
      : null;
  return {
    count: n,
    classificationAccuracy: n
      ? results.filter((r) => r.categoryCorrect).length / n
      : 0,
    priorityAccuracy: n
      ? results.filter((r) => r.priorityCorrect).length / n
      : 0,
    schemaCompliance: n ? results.filter((r) => r.schemaValid).length / n : 0,
    macroF1: perClass.reduce((a, c) => a + c.f1, 0) / categories.length,
    meanLatencyMs: n ? results.reduce((a, r) => a + r.latencyMs, 0) / n : 0,
    failedCount: results.filter((r) => r.error).length,
    inputTokens: total("inputTokens"),
    outputTokens: total("outputTokens"),
    estimatedCost: total("cost"),
    perClass,
  };
}
