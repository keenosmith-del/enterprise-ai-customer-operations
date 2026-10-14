import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseForm } from "./CaseForm";
import { State } from "./ui";
import { EvaluationMetrics } from "../pages/Evaluations";
import { PromptStudio } from "../pages/PromptStudio";
import { MemoryRouter } from "react-router-dom";
import { StrictMode } from "react";
import App from "../App";
describe("operator workflows", () => {
  it("mounts the complete app in Strict Mode and keeps navigation visible on API failure", async () => {
    // Browser automation can wrap imperative scroll APIs with a Promise result.
    const scroll = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => Promise.resolve() as unknown as void);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Controlled API failure")),
    );
    render(
      <StrictMode>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(
      screen.getByRole("heading", { name: "A clear view of every case." }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Controlled API failure",
    );
    expect(
      screen.getByRole("link", { name: "Operations" }),
    ).toBeInTheDocument();
    scroll.mockRestore();
  });
  it("validates required form fields and submits a case through Fetch", async () => {
    const onCreated = vi.fn(),
      user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "case-id", status: "New" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<CaseForm onCreated={onCreated} />);
    await user.click(
      screen.getByRole("button", { name: "Create & queue case" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Customer name"), "Alex Morgan");
    await user.type(screen.getByLabelText("Email"), "alex@example.test");
    await user.type(screen.getByLabelText("Subject"), "Invoice question");
    await user.type(
      screen.getByLabelText("Description"),
      "Please review the duplicate charge on my invoice.",
    );
    await user.click(
      screen.getByRole("button", { name: "Create & queue case" }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "case-id" }),
      ),
    );
    expect(fetchMock.mock.calls[0][0]).toContain("/cases");
    expect(fetchMock.mock.calls[0][1].body).toContain("Alex Morgan");
  });
  it("shows API failure without reporting success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "Operator token required" } }),
            { status: 401 },
          ),
        ),
    );
    const user = userEvent.setup();
    render(<CaseForm onCreated={vi.fn()} />);
    for (const [label, value] of [
      ["Customer name", "Alex"],
      ["Email", "alex@example.test"],
      ["Subject", "Test request"],
      ["Description", "A longer valid description"],
    ])
      await user.type(screen.getByLabelText(label), value);
    await user.click(
      screen.getByRole("button", { name: "Create & queue case" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Operator token required",
    );
  });
  it("renders loading/error/empty states and retry", async () => {
    const retry = vi.fn();
    const { rerender } = render(<State loading />);
    expect(screen.getByText(/Loading workspace/)).toBeInTheDocument();
    rerender(<State error="Unavailable" onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<State empty />);
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });
  it("labels simulation results and missing measurement values", () => {
    render(
      <EvaluationMetrics
        simulated
        metrics={{
          count: 30,
          classificationAccuracy: 0.8,
          priorityAccuracy: 0.7,
          macroF1: 0.6,
          schemaCompliance: 1,
          meanLatencyMs: 1,
          failedCount: 0,
          inputTokens: null,
          outputTokens: null,
          estimatedCost: null,
          perClass: [],
        }}
      />,
    );
    expect(screen.getByText(/not a real LLM benchmark/)).toBeInTheDocument();
    expect(screen.getByText("80.0%")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  });
  it("selects persisted prompt versions and displays the saved content", async () => {
    const versions = [
      {
        id: "v2",
        version: 2,
        content: "Draft version content",
        active: false,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        runs: [],
        activations: [],
      },
      {
        id: "v1",
        version: 1,
        content: "Active version content",
        active: true,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        runs: [],
        activations: [],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "t1",
              name: "Case Classification",
              kind: "classification",
              purpose: "Triage",
              versions,
            },
          ]),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <PromptStudio />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Prompt template content")).toHaveValue(
      "Active version content",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Prompt version"),
      "v2",
    );
    expect(screen.getByLabelText("Prompt template content")).toHaveValue(
      "Draft version content",
    );
  });
});
