import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useResource } from "../hooks/useResource";
import { post } from "../api/client";
import type { Operations as OperationsData, Job } from "../api/types";
import {
  Header,
  State,
  Metric,
  Badge,
  Modal,
  date,
  duration,
} from "../components/ui";
export function Operations() {
  const { data, error, loading, refresh } = useResource<OperationsData>(
    "/operations",
    4000,
  );
  const [selected, setSelected] = useState<Job | null>(null),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [simulation, setSimulation] = useState(false),
    [filter, setFilter] = useState("");
  const jobs = data?.jobs.filter((j) => !filter || j.state === filter) || [];
  return (
    <>
      <Header
        eyebrow="WORKSPACE / OPERATIONS"
        title="Reliability, made visible."
        description="Inspect delivery, retries and failures across the processing system."
      >
        <button onClick={refresh}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </Header>
      <State loading={loading} error={error} onRetry={refresh} />
      {data && (
        <>
          <div className="health-grid">
            {[
              ["API", data.health.api],
              ["PostgreSQL", data.health.database],
              [data.health.messagingProvider, data.health.messaging.connected],
              ["Worker heartbeat", data.health.workerHealthy],
            ].map(([label, ok]) => (
              <div key={String(label)} className="health-item">
                <span className={`dot ${ok ? "" : "offline"}`} />
                <strong>{label}</strong>
                <span>{ok ? "Healthy" : "Unavailable"}</span>
              </div>
            ))}
          </div>
          <section className="metrics-grid compact">
            <Metric
              label="Broker queued"
              value={data.health.messaging.queued ?? "Unavailable"}
            />
            <Metric label="In progress" value={data.counts.Processing || 0} />
            <Metric label="Retrying" value={data.counts.Retrying || 0} />
            <Metric label="Failed jobs" value={data.counts.Failed || 0} />
            <Metric
              label="Broker dead letters"
              value={data.health.messaging.deadLettered ?? "Unavailable"}
            />
            <Metric label="Outbox pending" value={data.outboxPending} />
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Processing jobs</h2>
                <p className="muted small">
                  At most {data.retryPolicy.maxAttempts} attempts · exponential
                  backoff from {data.retryPolicy.baseMs} ms · latest 100 jobs
                </p>
              </div>
              <div className="button-row">
                <select
                  aria-label="Filter jobs"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">All states</option>
                  {[
                    "Queued",
                    "Processing",
                    "Retrying",
                    "Succeeded",
                    "Failed",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {data.simulationEnabled && (
                  <button onClick={() => setSimulation(true)}>
                    Simulate failure
                  </button>
                )}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Work item</th>
                    <th>State</th>
                    <th>Attempts</th>
                    <th>Updated</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong>
                          {job.case?.subject || "Prompt evaluation"}
                        </strong>
                        <div className="muted small mono">
                          {job.id.slice(0, 8)}
                          {job.replayOf ? " · replay" : ""}
                        </div>
                      </td>
                      <td>
                        <Badge>{job.state}</Badge>
                      </td>
                      <td>{job.attempt}</td>
                      <td className="small muted">{date(job.updatedAt)}</td>
                      <td>
                        <button
                          onClick={() => {
                            setSelected(job);
                            setActionError("");
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <State empty={!jobs.length} />
          </section>
          <div className="overview-columns">
            <section className="panel">
              <div className="section-title">
                <h2>Worker & provider</h2>
                <ShieldCheck size={18} />
              </div>
              <p>
                {data.health.provider.name} · {data.health.provider.model}
              </p>
              {data.health.provider.simulated && (
                <p className="notice">
                  Simulated AI. No external provider is called.
                </p>
              )}
              {data.health.workers.map((w) => (
                <p className="small mono" key={w.name}>
                  {w.name}
                  <br />
                  <span className="muted">Last seen {date(w.lastSeen)}</span>
                </p>
              ))}
              <State empty={!data.health.workers.length} />
              {data.outboxErrors.map((e) => (
                <p className="error-text small" key={e.id}>
                  Outbox {e.id.slice(0, 8)} · {e.error} · {e.attempts}{" "}
                  publication attempts
                </p>
              ))}
            </section>
            <section className="panel">
              <h2>Recent operational events</h2>
              <div className="timeline">
                {data.events.slice(0, 8).map((e) => (
                  <div key={e.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{e.type}</strong>
                      <p>{e.message}</p>
                      <small>{date(e.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
              <State empty={!data.events.length} />
            </section>
          </div>
        </>
      )}
      {selected && (
        <Modal title="Job inspection" onClose={() => setSelected(null)}>
          <p className="mono small">{selected.id}</p>
          <Badge>{selected.state}</Badge>
          <p className="small">Correlation: {selected.correlationId}</p>
          {selected.caseId && (
            <Link className="text-link" to={`/cases/${selected.caseId}`}>
              Open associated case
            </Link>
          )}
          {selected.evaluationId && (
            <Link
              className="text-link"
              to={`/evaluations?run=${selected.evaluationId}`}
            >
              Open associated evaluation
            </Link>
          )}
          {selected.error && <p className="error-text">{selected.error}</p>}
          {selected.attempts.map((a) => (
            <div className="attempt" key={a.id}>
              <strong>
                Attempt {a.number} · {a.status}
              </strong>
              <p>{a.error || "No error recorded"}</p>
              <small>
                {a.errorCategory} · {duration(a.durationMs)} ·{" "}
                {date(a.startedAt)}
              </small>
            </div>
          ))}
          {actionError && (
            <p role="alert" className="error-text">
              {actionError}
            </p>
          )}
          {selected.state === "Failed" && (
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setActionError("");
                try {
                  await post(`/operations/jobs/${selected.id}/replay`, {});
                  setSelected(null);
                  refresh();
                } catch (e) {
                  setActionError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Replay as new auditable job
            </button>
          )}
        </Modal>
      )}
      {simulation && data && (
        <Modal
          title="Development failure simulation"
          onClose={() => setSimulation(false)}
        >
          <p className="notice">
            This reprocesses an eligible open case through the real queue.
            Transient fails once; permanent exhausts retries. Replaying removes
            the simulation flag.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setActionError("");
              try {
                await post(
                  "/operations/simulate",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                setSimulation(false);
                refresh();
              } catch (err) {
                setActionError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Case
              <select name="caseId" required>
                {[
                  ...new Map(
                    data.jobs
                      .filter(
                        (j) =>
                          j.caseId && ["Succeeded", "Failed"].includes(j.state),
                      )
                      .map((j) => [j.caseId, j]),
                  ).values(),
                ].map((j) => (
                  <option key={j.caseId} value={j.caseId!}>
                    {j.case?.subject || j.caseId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Failure mode
              <select name="mode">
                <option value="transient">
                  Transient · fail first attempt
                </option>
                <option value="permanent">
                  Permanent · exhaust retry policy
                </option>
              </select>
            </label>
            {actionError && (
              <p role="alert" className="error-text">
                {actionError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Queue simulated failure
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
