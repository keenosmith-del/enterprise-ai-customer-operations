import { useState } from "react";
import { post } from "../api/client";
import type { CustomerCase } from "../api/types";
export function CaseForm({
  onCreated,
}: {
  onCreated: (item: CustomerCase) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (!form.reportValidity()) return;
        setBusy(true);
        setError("");
        const body = Object.fromEntries(new FormData(form));
        try {
          onCreated(await post<CustomerCase>("/cases", body));
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        Create a real case. AI processing starts in the background;
        recommendations remain drafts.
      </p>
      <div className="form-grid">
        <label>
          Customer name
          <input
            name="customerName"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label>
          Email
          <input
            name="customerEmail"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
        </label>
      </div>
      <label>
        Subject
        <input name="subject" required minLength={4} maxLength={200} />
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={15000}
          rows={5}
        />
      </label>
      <label>
        Source
        <input name="source" defaultValue="Web" required maxLength={80} />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create & queue case"}
        </button>
      </div>
    </form>
  );
}
