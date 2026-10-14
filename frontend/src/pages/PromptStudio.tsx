import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, GitCompareArrows } from "lucide-react";
import { useResource } from "../hooks/useResource";
import { post, patch } from "../api/client";
import type { PromptTemplate, PromptVersion } from "../api/types";
import { Header, State, Badge, Modal, date } from "../components/ui";
function Editor({
  version,
  template,
  onSaved,
}: {
  version: PromptVersion;
  template: PromptTemplate;
  onSaved: (id?: string) => void;
}) {
  const [content, setContent] = useState(version.content),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [activation, setActivation] = useState(false),
    [comparing, setComparing] = useState(false);
  const immutable = !!version.publishedAt || version.runs.length > 0;
  async function save(duplicate = false) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const result =
        duplicate || immutable
          ? await post<PromptVersion>(`/prompts/${template.id}/versions`, {
              content,
            })
          : await patch<PromptVersion>(`/prompts/versions/${version.id}`, {
              content,
            });
      setSaved("Saved to PostgreSQL");
      onSaved(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel prompt-editor">
        <div className="section-title">
          <div>
            <h2>{template.name}</h2>
            <p className="muted small">{template.purpose}</p>
          </div>
          <Badge>
            {version.active ? "Active" : immutable ? "Immutable" : "Draft"} · v
            {version.version}
          </Badge>
        </div>
        <div className="variable-hint">
          Template variables: <code>{"{{case}}"}</code>
          {template.kind === "response" && <code>{"{{classification}}"}</code>}
          <span>80–20,000 characters</span>
        </div>
        <textarea
          aria-label="Prompt template content"
          className="code-editor"
          rows={17}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved("");
          }}
          spellCheck={false}
        />
        <p className="muted small">
          {immutable
            ? "Editing this version creates a new draft. Evaluated and activated content is preserved."
            : "This draft can be edited until it is evaluated or activated."}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {saved && <p className="success-text">{saved}</p>}
        <div className="button-row">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {immutable ? "Save as new version" : "Save draft"}
          </button>
          <button disabled={busy} onClick={() => void save(true)}>
            <Copy size={15} />
            Duplicate
          </button>
          <button onClick={() => setComparing(true)}>
            <GitCompareArrows size={15} />
            Compare
          </button>
          <button
            disabled={busy || version.active || content !== version.content}
            onClick={() => setActivation(true)}
          >
            <Check size={15} />
            Activate saved version
          </button>
          <Link className="button" to={`/evaluations?prompt=${version.id}`}>
            Evaluate
          </Link>
        </div>
      </section>
      <section className="panel">
        <h2>Version history & activation audit</h2>
        <p className="small muted">
          Created {date(version.createdAt)}
          {version.publishedAt
            ? ` · Published ${date(version.publishedAt)}`
            : ""}
        </p>
        {version.activationOverride && (
          <p className="notice">
            Quality gate override: {version.activationOverride}
          </p>
        )}
        {version.activations.map((a) => (
          <p key={a.id} className="small">
            {a.operator} · {date(a.createdAt)}
            <br />
            {a.overrideReason || "Passed configured evaluation gate"}
          </p>
        ))}
        {version.runs.map((r) => (
          <Link className="list-row" key={r.id} to={`/evaluations?run=${r.id}`}>
            <span>
              {r.status} · {r.simulated ? "Simulation" : r.provider}
            </span>
            <small>{date(r.createdAt)}</small>
          </Link>
        ))}
        <State empty={!version.activations.length && !version.runs.length} />
      </section>
      {activation && (
        <Modal
          title="Activate prompt version"
          onClose={() => setActivation(false)}
        >
          <p className="notice">
            A passing real-provider evaluation is required. If this version has
            no passing run, activation requires a recorded override. Demo
            evaluations do not validate model quality.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setError("");
              try {
                await post(`/prompts/versions/${version.id}/activate`, {
                  operator: fields.operator,
                  ...(fields.overrideReason
                    ? { overrideReason: fields.overrideReason }
                    : {}),
                });
                setActivation(false);
                onSaved();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Operator
              <input
                name="operator"
                required
                minLength={2}
                defaultValue="Local operator"
              />
            </label>
            <label>
              Override reason (if needed)
              <textarea
                name="overrideReason"
                minLength={10}
                placeholder="Explain why you are activating an unvalidated version."
                rows={3}
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Confirm activation
            </button>
          </form>
        </Modal>
      )}
      {comparing && (
        <Modal
          title="Compare prompt versions"
          onClose={() => setComparing(false)}
        >
          <CompareVersions version={version} versions={template.versions} />
        </Modal>
      )}
    </>
  );
}
function CompareVersions({
  version,
  versions,
}: {
  version: PromptVersion;
  versions: PromptVersion[];
}) {
  const [other, setOther] = useState(
    versions.find((p) => p.id !== version.id)?.id || version.id,
  );
  return (
    <>
      <label>
        Compare with
        <select value={other} onChange={(e) => setOther(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Version {v.version}
            </option>
          ))}
        </select>
      </label>
      <div className="compare-prompts">
        <div>
          <h3>Selected · v{version.version}</h3>
          <pre>{version.content}</pre>
        </div>
        <div>
          <h3>Comparison · v{versions.find((v) => v.id === other)?.version}</h3>
          <pre>{versions.find((v) => v.id === other)?.content}</pre>
        </div>
      </div>
    </>
  );
}
export function PromptStudio() {
  const { data, error, loading, refresh } =
    useResource<PromptTemplate[]>("/prompts");
  const [templateId, setTemplateId] = useState(""),
    [versionId, setVersionId] = useState("");
  const template = data?.find((t) => t.id === templateId) || data?.[0];
  const version =
    template?.versions.find((v) => v.id === versionId) ||
    template?.versions.find((v) => v.active) ||
    template?.versions[0];
  return (
    <>
      <Header
        eyebrow="INTELLIGENCE / PROMPT STUDIO"
        title="Better prompts. Clear provenance."
        description="Develop, evaluate and activate the policies behind every recommendation."
      />
      <State loading={loading} error={error} onRetry={refresh} />
      {data && (
        <>
          <div className="tabs">
            {data.map((t) => (
              <button
                className={template?.id === t.id ? "selected" : ""}
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setVersionId("");
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          {template && version && (
            <>
              <div className="version-select">
                <label>
                  Prompt version
                  <select
                    value={version.id}
                    onChange={(e) => setVersionId(e.target.value)}
                  >
                    {template.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.version} ·{" "}
                        {v.active
                          ? "Active"
                          : v.publishedAt
                            ? "Published"
                            : "Draft"}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted small">
                  The worker uses the active versions captured when a job is
                  queued.
                </span>
              </div>
              <Editor
                key={version.id}
                template={template}
                version={version}
                onSaved={(id) => {
                  if (id) setVersionId(id);
                  refresh();
                }}
              />
            </>
          )}
          <State empty={!data.length} />
        </>
      )}
    </>
  );
}
