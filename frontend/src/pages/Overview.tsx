import { Link } from "react-router-dom";
import { Activity, Layers, CircleCheck } from "lucide-react";
import { useResource } from "../hooks/useResource";
import type { Dashboard } from "../api/types";
import {
  Header,
  Metric,
  State,
  Badge,
  date,
  percent,
  duration,
} from "../components/ui";
import { CaseTable } from "../components/CaseTable";
export function Overview() {
  const { data, error, loading, refresh } = useResource<Dashboard>(
    "/dashboard",
    5000,
  );
  return (
    <>
      <Header
        eyebrow="WORKSPACE / OVERVIEW"
        title="A clear view of every case."
        description="Customer operations, with intelligence and oversight."
      />
      <State loading={loading} error={error} onRetry={refresh} />
      {data && (
        <>
          <div className="provider-strip">
            <span className="dot" />
            <span>
              {data.provider.simulated
                ? "Demo provider · simulated AI"
                : "Live AI provider"}{" "}
              <b>{data.provider.model}</b>
            </span>
            <span className="muted">
              Recommendations require operator approval.
            </span>
          </div>
          <section className="metrics-grid">
            <Metric label="Total cases" value={data.total} />
            <Metric
              label="Needs review"
              value={data.counts.Review || 0}
              note="Human attention required"
            />
            <Metric
              label="AI processed"
              value={
                (data.counts.Processed || 0) +
                (data.counts.Review || 0) +
                (data.counts.Approved || 0) +
                (data.counts.Resolved || 0)
              }
              note="Includes reviewed and resolved"
            />
            <Metric
              label="Operator resolved"
              value={data.counts.Resolved || 0}
              note="Closed by a person"
            />
          </section>
          <div className="overview-columns">
            <section className="panel">
              <div className="section-title">
                <h2>Recent cases</h2>
                <Link className="text-link" to="/cases">
                  View all cases
                </Link>
              </div>
              <CaseTable items={data.recentCases} />
              <State empty={!data.recentCases.length} />
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>Workflow at a glance</h2>
                <Layers size={18} />
              </div>
              <div className="distribution">
                {[
                  "New",
                  "Processing",
                  "Review",
                  "Processed",
                  "Approved",
                  "Resolved",
                  "Failed",
                ].map((status) => (
                  <div key={status}>
                    <span>{status}</span>
                    <div className="bar-track">
                      <div
                        style={{
                          width: `${data.total ? ((data.counts[status] || 0) / data.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <b>{data.counts[status] || 0}</b>
                  </div>
                ))}
              </div>
              <div className="mini-metrics">
                <Metric label="Failed jobs" value={data.failedJobs} />
                <Metric
                  label="Mean processing"
                  value={duration(data.averageProcessingLatencyMs)}
                />
              </div>
            </section>
          </div>
          <div className="overview-columns">
            <section className="panel">
              <div className="section-title">
                <h2>Processing activity</h2>
                <Activity size={18} />
              </div>
              <div className="timeline">
                {data.events.map((event) => (
                  <div key={event.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{event.type}</strong>
                      <p>{event.message}</p>
                      <small>
                        {event.case?.subject} · {date(event.createdAt)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <State empty={!data.events.length} />
              {data.failures.length > 0 && (
                <details>
                  <summary>
                    Recent failures and retries ({data.failures.length})
                  </summary>
                  {data.failures.map((a) => (
                    <p key={a.id} className="small">
                      Attempt {a.number}: {a.error} · {a.errorCategory}
                    </p>
                  ))}
                </details>
              )}
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>Intelligence & quality</h2>
                <CircleCheck size={18} />
              </div>
              <div className="quality-number">
                {percent(data.classificationAccuracy)}
              </div>
              <p className="muted">
                Latest evaluation classification accuracy
                {data.accuracySimulated
                  ? " · simulation, not an LLM benchmark"
                  : ""}
                .
              </p>
              <div className="prompt-summary">
                {data.prompts.map((p) => (
                  <div key={p.id}>
                    <span>{p.template?.name}</span>
                    <Badge>Version {p.version}</Badge>
                  </div>
                ))}
              </div>
              {data.evaluations.map((run) => (
                <Link
                  key={run.id}
                  className="list-row"
                  to={`/evaluations?run=${run.id}`}
                >
                  <div>
                    <strong>Evaluation · v{run.prompt.version}</strong>
                    <small>
                      {date(run.createdAt)} ·{" "}
                      {run.simulated ? "Simulated" : run.provider}
                    </small>
                  </div>
                  <span>{percent(run.metrics?.macroF1)} F1</span>
                </Link>
              ))}
              <Link to="/evaluations" className="text-link">
                Open evaluations
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
