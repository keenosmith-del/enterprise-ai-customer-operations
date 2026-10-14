import { describe, it, expect, vi, afterEach } from "vitest";
import {
  classificationSchema,
  defaultClassificationPrompt,
  defaultResponsePrompt,
  enforceRules,
  validateTemplate,
  renderPrompt,
} from "../ai/schema.js";
import {
  DemoProvider,
  OpenAIProvider,
  ProviderError,
} from "../ai/providers.js";
import { score } from "../evaluation/scoring.js";
import { caseInput, reviewInput, caseFilters } from "../services/cases.js";
import { retryDelay } from "../services/processing.js";
import { eventSchema } from "../messaging/contract.js";
import { requireOperator } from "../middleware/security.js";
import { config } from "../config.js";
afterEach(() => vi.unstubAllGlobals());
describe("input contracts and policy", () => {
  it("rejects invalid case creation and defaults source", () => {
    expect(
      caseInput.safeParse({
        customerName: "A",
        customerEmail: "bad",
        subject: "hi",
        description: "short",
      }).success,
    ).toBe(false);
    expect(
      caseInput.parse({
        customerName: "Alex",
        customerEmail: "alex@example.test",
        subject: "Help please",
        description: "I need help with billing",
      }).source,
    ).toBe("Web");
  });
  it("validates review concurrency and filters", () => {
    expect(reviewInput.safeParse({ action: "resolve" }).success).toBe(false);
    expect(caseFilters.safeParse({ page: 0 }).success).toBe(false);
    expect(caseFilters.safeParse({ priority: "Urgent" }).success).toBe(false);
  });
  it("requires template variables and prevents recursive input rendering", () => {
    expect(() => validateTemplate("x".repeat(100), "classification")).toThrow();
    expect(() =>
      validateTemplate(
        defaultResponsePrompt.replace("{{classification}}", "{{secret}}"),
        "response",
      ),
    ).toThrow();
    expect(
      renderPrompt(
        "Customer: {{case}}",
        { description: "{{classification}}" },
        {},
      ),
    ).toContain("{{classification}}");
  });
  it("requires operator credentials", () => {
    expect(() =>
      requireOperator({ header: () => "" } as any, {} as any, () => {}),
    ).toThrow("Operator token required");
    const next = vi.fn();
    requireOperator(
      { header: () => config.ADMIN_TOKEN } as any,
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
  it("requires strict structured output and overrides unsafe routing", async () => {
    const demo = await new DemoProvider().infer(
      {
        subject: "Account hacked",
        description: "Someone has stolen my account",
      },
      defaultClassificationPrompt,
      defaultResponsePrompt,
    );
    expect(demo.output.reviewRequired).toBe(true);
    expect(demo.output.team).toBe("Escalations");
    expect(demo.inputTokens).toBeNull();
    expect(
      classificationSchema.safeParse({ ...demo.output, category: "Unknown" })
        .success,
    ).toBe(false);
    expect(
      classificationSchema.safeParse({ ...demo.output, secret: "x" }).success,
    ).toBe(false);
    expect(
      enforceRules(
        { ...demo.output, team: "Sales", priority: "Critical" },
        "request",
      ).reviewRequired,
    ).toBe(true);
  });
  it("enforces critical human review for explicit safety and broad outage concerns", async () => {
    const p = new DemoProvider();
    for (const input of [
      {
        subject: "Safety concern",
        description: "There is an immediate safety concern.",
      },
      {
        subject: "Outage",
        description: "Service is unavailable for all users.",
      },
    ]) {
      const result = await p.infer(
        input,
        defaultClassificationPrompt,
        defaultResponsePrompt,
      );
      expect(result.output.priority).toBe("Critical");
      expect(result.output.reviewRequired).toBe(true);
    }
  });
  it("produces deterministic explicitly simulated outputs", async () => {
    const p = new DemoProvider(),
      input = {
        subject: "Duplicate invoice",
        description: "I was charged twice",
      };
    const a = await p.infer(
        input,
        defaultClassificationPrompt,
        defaultResponsePrompt,
      ),
      b = await p.infer(
        input,
        defaultClassificationPrompt,
        defaultResponsePrompt,
      );
    expect(a.output).toEqual(b.output);
    expect(a.simulated).toBe(true);
    expect(a.cost).toBeNull();
  });
  it("uses bounded exponential retry policy and validates event contracts", () => {
    expect(retryDelay(2)).toBe(retryDelay(1) * 2);
    expect(eventSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
});
describe("evaluation scoring", () => {
  it("counts failures in denominators and computes class precision/recall/F1", () => {
    const row = {
      priorityCorrect: true,
      schemaValid: true,
      latencyMs: 20,
      error: null,
      inputTokens: null,
      outputTokens: null,
      cost: null,
    };
    const metrics = score([
      {
        ...row,
        expectedCategory: "Billing",
        predictedCategory: "Billing",
        categoryCorrect: true,
      },
      {
        ...row,
        expectedCategory: "Complaint",
        predictedCategory: "Billing",
        categoryCorrect: false,
      },
      {
        ...row,
        expectedCategory: "Billing",
        predictedCategory: null,
        categoryCorrect: false,
        priorityCorrect: false,
        schemaValid: false,
        error: "schema",
      },
    ]);
    expect(metrics.classificationAccuracy).toBeCloseTo(1 / 3);
    const billing = metrics.perClass.find((r) => r.category === "Billing")!;
    expect(billing.precision).toBe(0.5);
    expect(billing.recall).toBe(0.5);
    expect(billing.f1).toBe(0.5);
    expect(metrics.macroF1).toBeCloseTo(0.5 / 6);
    expect(metrics.schemaCompliance).toBeCloseTo(2 / 3);
    expect(metrics.failedCount).toBe(1);
    expect(metrics.inputTokens).toBeNull();
  });
  it("reports empty metrics without invented usage", () => {
    expect(score([]).classificationAccuracy).toBe(0);
    expect(score([]).estimatedCost).toBeNull();
  });
});
describe("OpenAI-compatible Fetch integration", () => {
  it("calls both versioned prompts and aggregates genuine usage", async () => {
    const output = (
      await new DemoProvider().infer(
        { subject: "Invoice help", description: "billing question" },
        defaultClassificationPrompt,
        defaultResponsePrompt,
      )
    ).output;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    response: "Draft response for review",
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 30, completion_tokens: 40 },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAIProvider().infer(
      { subject: "Invoice help", description: "billing question" },
      defaultClassificationPrompt,
      defaultResponsePrompt,
    );
    expect(result.inputTokens).toBe(40);
    expect(result.outputTokens).toBe(60);
    expect(result.simulated).toBe(false);
    expect(fetchMock.mock.calls[0][1].body).toContain("Invoice help");
    expect(fetchMock.mock.calls[1][1].body).toContain("Validated triage");
  });
  it("surfaces invalid JSON and rate limiting", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
          ),
        ),
    );
    await expect(
      new OpenAIProvider().infer(
        { subject: "Test", description: "Test input" },
        defaultClassificationPrompt,
        defaultResponsePrompt,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );
    await expect(
      new OpenAIProvider().infer(
        { subject: "Test", description: "Test input" },
        defaultClassificationPrompt,
        defaultResponsePrompt,
      ),
    ).rejects.toMatchObject({ category: "rate_limit" });
  });
  it("fails on provider timeout and missing structured fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(
      new OpenAIProvider().infer(
        { subject: "Test", description: "Test" },
        defaultClassificationPrompt,
        defaultResponsePrompt,
      ),
    ).rejects.toMatchObject({ category: "provider_timeout" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          ),
        ),
    );
    await expect(
      new OpenAIProvider().infer(
        { subject: "Test", description: "Test" },
        defaultClassificationPrompt,
        defaultResponsePrompt,
      ),
    ).rejects.toMatchObject({ category: "schema" });
  });
});
