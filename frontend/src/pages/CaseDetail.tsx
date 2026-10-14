import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RotateCw, ChevronLeft } from "lucide-react";
import { useResource } from "../hooks/useResource";
import { post } from "../api/client";
import {
  categories,
  priorities,
  type CustomerCase,
  type CaseEvent,
  type Job,
  type PromptVersion,
} from "../api/types";
import { Header, State, Badge, date, duration } from "../components/ui";
type Detail = CustomerCase & {
  events: CaseEvent[];
  jobs: Job[];
  prompts: PromptVersion[];
  reviews: {
    id: string;
    operator: string;
    action: string;
    createdAt: string;
  }[];
};
function ReviewForm({ item, onSaved }: { item: Detail; onSaved: () => void }) {
  const [category, setCategory] = useState(item.category || categories[0]),
    [priority, setPriority] = useState(item.priority || "Medium"),
    [response, setResponse] = useState(item.response || ""),
    [operator, setOperator] = useState("Local operator"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(action: string) {
    setBusy(true);
    setError("");
    try {
      await post(`/cases/${item.id}/reviews`, {
        action,
        category,
        priority,
        response,
        operator,
        updatedAt: item.updatedAt,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Human review</h2>
        <Badge>Operator action</Badge>
      </div>
      <p className="muted">
        Corrections are recorded separately from the original AI output.
        Responses remain drafts.
      </p>
      <label>
        Reviewed by
        <input
          value={operator}
          minLength={2}
          required
          onChange={(e) => setOperator(e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Recommended response
        <textarea
          rows={7}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          maxLength={10000}
        />
      </label>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="button-row">
        <button
          disabled={busy || operator.length < 2 || !response.trim()}
          onClick={() => void submit("accept")}
        >
          Accept classification
        </button>
        <button
          disabled={busy || operator.length < 2 || !response.trim()}
          onClick={() => void submit("correct")}
        >
          Save corrections
        </button>
        <button
          className="primary"
          disabled={busy || operator.length < 2 || !response.trim()}
          onClick={() => void submit("approve")}
        >
          Approve recommendation
        </button>
        {item.status === "Approved" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void submit("resolve")}
          >
            Mark resolved
          </button>
        )}
      </div>
    </section>
  );
}
export function CaseDetail() {
  const { id } = useParams();
  const { data, error, loading, refresh } = useResource<Detail>(
    `/cases/${id}`,
    3000,
  );
  const [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  const latest = data?.jobs[0];
  return (
    <>
      <Link className="back-link" to="/cases">
        <ChevronLeft size={16} />
        All cases
      </Link>
      <Header
        eyebrow="CASE / DETAIL"
        title={data?.subject || "Customer request"}
        description={
          data
            ? `${data.customerName} · ${data.customerEmail}`
            : "Loading case context…"
        }
      >
        {data && !["New", "Processing", "Resolved"].includes(data.status) && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setActionError("");
              try {
                await post(`/cases/${id}/reprocess`, {});
                refresh();
              } catch (e) {
                setActionError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RotateCw size={16} />
            Reprocess
          </button>
        )}
      </Header>
      <State loading={loading} error={error} onRetry={refresh} />
      {actionError && (
        <p role="alert" className="error-text">
          {actionError}
        </p>
      )}
      {data && (
        <>
          <div className="detail-meta">
            <Badge>{data.status}</Badge>
            {data.priority && <Badge>{data.priority}</Badge>}
            <span>{data.team || "Unassigned"}</span>
            <span className="muted">Received {date(data.createdAt)}</span>
            {data.synthetic && <Badge>Synthetic sample</Badge>}
          </div>
          <div className="detail-columns">
            <div className="stack">
              <section className="panel">
                <h2>Original request</h2>
                <p className="request-text">{data.description}</p>
                <small className="muted">Source: {data.source}</small>
              </section>
              {data.summary && (
                <section className="panel">
                  <div className="section-title">
                    <h2>AI recommendation</h2>
                    <Badge>
                      {latest?.result?.simulated
                        ? "Simulated AI"
                        : latest?.result?.provider || "AI"}
                    </Badge>
                  </div>
                  <p>{data.summary}</p>
                  <div className="recommendation-grid">
                    <div>
                      <small>Category</small>
                      <strong>{data.category}</strong>
                    </div>
                    <div>
                      <small>Routing team</small>
                      <strong>{data.team}</strong>
                    </div>
                  </div>
                  {data.reviewRequired && (
                    <p className="notice">
                      Review required: {data.reviewReason}
                    </p>
                  )}
                  <p className="muted small">
                    Current fields may include human corrections. The immutable
                    job result below preserves the AI recommendation.
                  </p>
                  {latest?.result && (
                    <details>
                      <summary>Original inference record</summary>
                      <pre>{JSON.stringify(latest.result, null, 2)}</pre>
                    </details>
                  )}
                </section>
              )}
              {data.response &&
                !["New", "Processing", "Failed", "Resolved"].includes(
                  data.status,
                ) && (
                  <ReviewForm
                    key={`${data.id}:${data.updatedAt}`}
                    item={data}
                    onSaved={refresh}
                  />
                )}{" "}
              {data.status === "Resolved" && (
                <section className="panel">
                  <h2>Approved response draft</h2>
                  <p className="request-text">{data.response}</p>
                  <p className="muted small">
                    Resolved by an operator. No message was sent to the
                    customer.
                  </p>
                </section>
              )}
            </div>
            <div className="stack">
              <section className="panel">
                <h2>Processing context</h2>
                {latest ? (
                  <dl>
                    <dt>Job</dt>
                    <dd className="mono">{latest.id}</dd>
                    <dt>State / attempts</dt>
                    <dd>
                      {latest.state} · {latest.attempt}
                    </dd>
                    <dt>Provider / model</dt>
                    <dd>
                      {latest.result?.provider || "Not completed"}
                      <br />
                      {latest.result?.model || "—"}
                    </dd>
                    <dt>Inference latency</dt>
                    <dd>{duration(latest.result?.latencyMs)}</dd>
                    {[
                      latest.classificationPromptId,
                      latest.responsePromptId,
                    ].map((pid) => {
                      const p = data.prompts.find((p) => p.id === pid);
                      return (
                        <div key={pid}>
                          <dt>{p?.template?.name || "Prompt"}</dt>
                          <dd>Version {p?.version ?? "Unavailable"}</dd>
                        </div>
                      );
                    })}
                    <dt>Correlation</dt>
                    <dd className="mono">{latest.correlationId}</dd>
                    {latest.error && (
                      <dd className="error-text">{latest.error}</dd>
                    )}
                  </dl>
                ) : (
                  <State empty />
                )}
              </section>
              <section className="panel">
                <h2>Timeline</h2>
                <div className="timeline">
                  {data.events.map((event) => (
                    <div key={event.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{event.type}</strong>
                        <p>{event.message}</p>
                        <small>{date(event.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Attempts & review history</h2>
                {data.jobs.map((job) => (
                  <details key={job.id}>
                    <summary>
                      {job.state} · {job.attempt} attempts
                      {job.replayOf ? " · replay" : ""}
                    </summary>
                    {job.attempts.map((a) => (
                      <p key={a.id} className="small">
                        #{a.number} {a.status} · {duration(a.durationMs)}
                        <br />
                        {a.errorCategory} {a.error}
                      </p>
                    ))}
                  </details>
                ))}
                {data.reviews.map((r) => (
                  <p className="small" key={r.id}>
                    {r.operator} · {r.action}
                    <br />
                    <span className="muted">{date(r.createdAt)}</span>
                  </p>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
