import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, GitCompareArrows } from "lucide-react";
import { useResource } from "../hooks/useResource";
import { post } from "../api/client";
import type {
  Dataset,
  PromptTemplate,
  EvaluationRun,
  Metrics,
  Result,
} from "../api/types";
import {
  Header,
  State,
  Badge,
  Modal,
  Metric,
  percent,
  duration,
  date,
} from "../components/ui";
export function EvaluationMetrics({
  metrics,
  simulated,
}: {
  metrics: Metrics;
  simulated: boolean;
}) {
  return (
    <>
      <p className="notice">
        {simulated
          ? "Deterministic simulation: these scores verify this pipeline and are not a real LLM benchmark."
          : "Measured provider results on a small synthetic dataset; inspect failures before activation."}
      </p>
      <div className="metrics-grid compact">
        <Metric
          label="Category accuracy"
          value={percent(metrics.classificationAccuracy)}
        />
        <Metric
          label="Priority accuracy"
          value={percent(metrics.priorityAccuracy)}
        />
        <Metric label="Macro-F1" value={percent(metrics.macroF1)} />
        <Metric
          label="Schema compliance"
          value={percent(metrics.schemaCompliance)}
        />
        <Metric
          label="Mean inference"
          value={duration(metrics.meanLatencyMs)}
        />
        <Metric label="Failed examples" value={metrics.failedCount} />
        <Metric
          label="Tokens (input / output)"
          value={
            metrics.inputTokens == null
              ? "Unavailable"
              : `${metrics.inputTokens} / ${metrics.outputTokens}`
          }
        />
        <Metric
          label="Estimated cost"
          value={
            metrics.estimatedCost == null
              ? "Unavailable"
              : `$${metrics.estimatedCost.toFixed(5)}`
          }
        />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Support</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1</th>
            </tr>
          </thead>
          <tbody>
            {metrics.perClass.map((c) => (
              <tr key={c.category}>
                <td>{c.category}</td>
                <td>{c.support}</td>
                <td>{percent(c.precision)}</td>
                <td>{percent(c.recall)}</td>
                <td>{percent(c.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function ExampleResults({ results }: { results: Result[] }) {
  return (
    <div className="example-results">
      {results.map((r) => (
        <details key={r.id}>
          <summary>
            <span>
              {r.example.key}. {r.example.subject}
            </span>
            <Badge>
              {r.error
                ? "Failed"
                : r.categoryCorrect && r.priorityCorrect
                  ? "Correct"
                  : "Mismatch"}
            </Badge>
          </summary>
          <p>{r.example.description}</p>
          <div className="form-grid">
            <div>
              <small className="muted">Expected</small>
              <p>
                {r.example.expectedCategory} · {r.example.expectedPriority}
              </p>
            </div>
            <div>
              <small className="muted">Predicted</small>
              <p>
                {r.output
                  ? `${r.output.category} · ${r.output.priority}`
                  : "No valid output"}
              </p>
            </div>
          </div>
          <p className="small muted">
            Schema {r.schemaValid ? "valid" : "invalid"} ·{" "}
            {duration(r.latencyMs)}
          </p>
          {r.error && <p className="error-text">{r.error}</p>}
          {r.output && <p>{r.output.response}</p>}
        </details>
      ))}
    </div>
  );
}
function RunDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useResource<EvaluationRun>(
    `/evaluations/${id}`,
    3000,
  );
  return (
    <>
      <State loading={loading} error={error} onRetry={refresh} />
      {data && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Evaluation · v{data.prompt.version}</h2>
              <p className="muted small">
                {data.dataset.name} · {data.provider} / {data.model}
              </p>
            </div>
            <Badge>{data.status}</Badge>
          </div>
          <div className="progress">
            <span
              style={{
                width: `${data.dataset._count?.examples ? ((data.results?.length || 0) / data.dataset._count.examples) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="muted small">
            {data.results?.length || 0} / {data.dataset._count?.examples || "—"}{" "}
            examples persisted · {date(data.createdAt)}
          </p>
          {data.metrics && (
            <EvaluationMetrics
              metrics={data.metrics}
              simulated={data.simulated}
            />
          )}
          <h3>Example inspection</h3>
          <ExampleResults results={data.results || []} />
          {data.jobs?.map(
            (j) =>
              j.error && (
                <p role="alert" className="error-text" key={j.id}>
                  {j.state}: {j.error}
                </p>
              ),
          )}
        </section>
      )}
    </>
  );
}
function Comparison({
  baseline,
  candidate,
}: {
  baseline: string;
  candidate: string;
}) {
  const { data, error, loading } = useResource<{
    delta: Record<string, number>;
    regressions: Result[];
    baseline: EvaluationRun;
    candidate: EvaluationRun;
  }>(`/evaluations/compare?baseline=${baseline}&candidate=${candidate}`);
  return (
    <>
      <State loading={loading} error={error} />
      {data && (
        <>
          <p className="muted">
            Candidate minus baseline. Positive accuracy/F1 is better; lower
            latency is better.
          </p>
          <p className="small">
            {data.baseline.provider} / {data.baseline.model} →{" "}
            {data.candidate.provider} / {data.candidate.model}
            {(data.baseline.simulated || data.candidate.simulated) &&
              " · Includes simulated results"}
          </p>
          <div className="metrics-grid compact">
            {Object.entries(data.delta).map(([key, value]) => (
              <Metric
                key={key}
                label={
                  (
                    {
                      classificationAccuracy: "Classification accuracy",
                      priorityAccuracy: "Priority accuracy",
                      macroF1: "Macro-F1",
                      schemaCompliance: "Schema compliance",
                      meanLatencyMs: "Mean latency",
                    } as Record<string, string>
                  )[key] || key
                }
                value={
                  key === "meanLatencyMs"
                    ? `${value >= 0 ? "+" : ""}${value.toFixed(0)} ms`
                    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`
                }
              />
            ))}
          </div>
          <h3>Example-level regressions ({data.regressions.length})</h3>
          <ExampleResults results={data.regressions} />
          <State empty={!data.regressions.length} />
        </>
      )}
    </>
  );
}
export function Evaluations() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("run") || "";
  const {
    data: runs,
    error,
    loading,
    refresh,
  } = useResource<EvaluationRun[]>("/evaluations", 4000);
  const { data: datasets, error: datasetError } = useResource<Dataset[]>(
    "/evaluations/datasets",
  );
  const { data: templates, error: promptError } =
    useResource<PromptTemplate[]>("/prompts");
  const [creating, setCreating] = useState(false),
    [comparing, setComparing] = useState(false),
    [baseline, setBaseline] = useState(""),
    [candidate, setCandidate] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  const classification = templates?.find((t) => t.kind === "classification"),
    response = templates?.find((t) => t.kind === "response");
  const complete = runs?.filter((r) => r.status === "Completed") || [];
  return (
    <>
      <Header
        eyebrow="INTELLIGENCE / EVALUATIONS"
        title="Measure before you activate."
        description="Test versioned prompts against labelled requests and inspect every outcome."
      >
        <div className="button-row">
          <button
            disabled={complete.length < 2}
            onClick={() => {
              setBaseline(complete[1]?.id || "");
              setCandidate(complete[0]?.id || "");
              setComparing(true);
            }}
          >
            <GitCompareArrows size={16} />
            Compare runs
          </button>
          <button className="primary" onClick={() => setCreating(true)}>
            <Play size={16} />
            New evaluation
          </button>
        </div>
      </Header>
      <State
        loading={loading}
        error={error || datasetError || promptError}
        onRetry={refresh}
      />
      {runs && (
        <div className="evaluation-layout">
          <section className="panel run-list">
            <h2>Evaluation runs</h2>
            {runs.map((run) => (
              <button
                key={run.id}
                className={`run-item ${selected === run.id ? "selected" : ""}`}
                onClick={() => setParams({ run: run.id })}
              >
                <div>
                  <strong>Classification · v{run.prompt.version}</strong>
                  <Badge>{run.status}</Badge>
                </div>
                <small>
                  {run.simulated ? "Simulated · " : ""}
                  {run.model}
                </small>
                <span>
                  {run.metrics
                    ? `${percent(run.metrics.classificationAccuracy)} accuracy`
                    : `${run._count?.results || 0} examples completed`}
                </span>
                <small>{date(run.createdAt)}</small>
              </button>
            ))}
            <State empty={!runs.length} />
          </section>
          {selected ? (
            <RunDetail key={selected} id={selected} />
          ) : (
            <section className="panel state">
              <p>Select a run to inspect results, or start a new evaluation.</p>
            </section>
          )}
        </div>
      )}
      {creating && (
        <Modal title="Start evaluation" onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setActionError("");
              try {
                const run = await post<EvaluationRun>("/evaluations", body);
                setCreating(false);
                setParams({ run: run.id });
                refresh();
              } catch (err) {
                setActionError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">
              Runs execute through the background worker. Model inputs exclude
              expected labels.
            </p>
            <label>
              Classification version
              <select
                name="promptId"
                required
                defaultValue={
                  classification?.versions.some(
                    (v) => v.id === params.get("prompt"),
                  )
                    ? params.get("prompt")!
                    : classification?.versions.find((v) => v.active)?.id
                }
              >
                {classification?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version}
                    {v.active ? " · Active" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Response version
              <select
                name="responsePromptId"
                required
                defaultValue={
                  params.get("prompt") &&
                  response?.versions.some((v) => v.id === params.get("prompt"))
                    ? params.get("prompt")!
                    : response?.versions.find((v) => v.active)?.id
                }
              >
                {response?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version}
                    {v.active ? " · Active" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dataset
              <select name="datasetId" required>
                {datasets?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d._count.examples} examples
                  </option>
                ))}
              </select>
            </label>
            {actionError && (
              <p className="error-text" role="alert">
                {actionError}
              </p>
            )}
            <button
              className="primary"
              disabled={
                busy || !datasets?.length || !classification || !response
              }
            >
              {busy ? "Queuing…" : "Queue evaluation"}
            </button>
          </form>
        </Modal>
      )}
      {comparing && (
        <Modal
          title="Compare completed runs"
          onClose={() => setComparing(false)}
        >
          <div className="form-grid">
            <label>
              Baseline
              <select
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
              >
                {complete.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.prompt.version} · {date(r.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Candidate
              <select
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
              >
                {complete.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.prompt.version} · {date(r.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {baseline && candidate && (
            <Comparison baseline={baseline} candidate={candidate} />
          )}
        </Modal>
      )}
    </>
  );
}
