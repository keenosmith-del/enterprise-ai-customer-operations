import { useEffect, useRef, type ReactNode } from "react";
import { X, LoaderCircle, CircleAlert, Plus } from "lucide-react";
export function Badge({ children }: { children: ReactNode }) {
  const value = String(children);
  return (
    <span
      className={`badge ${["Review", "Critical", "Failed"].includes(value) ? "attention" : value === "Resolved" || value === "Succeeded" || value === "Completed" ? "success" : ""}`}
    >
      {children}
    </span>
  );
}
export function Header({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function State({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="state error" role="alert">
        <CircleAlert size={20} />
        <p>{error}</p>
        {onRetry && <button onClick={onRetry}>Try again</button>}
      </div>
    );
  if (loading)
    return (
      <div className="state">
        <LoaderCircle className="spin" size={20} />
        Loading workspace…
      </div>
    );
  if (empty)
    return (
      <div className="state">
        Nothing here yet. Your next action will appear here.
      </div>
    );
  return null;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const percent = (value: number | null | undefined) =>
  value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
export const duration = (value: number | null | undefined) =>
  value == null
    ? "Unavailable"
    : value < 1000
      ? `${Math.round(value)} ms`
      : `${(value / 1000).toFixed(1)} s`;
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={16} />
      {children}
    </button>
  );
}
