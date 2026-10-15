/** Small shared building blocks: pills, loading/error states, a modal dialog. Used by every screen. */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { LoadStatus } from "../app/AppContext";
import type { Query } from "../app/AppContext";
import type { ApiClientError } from "../api/client";
import type { LabelAndTone, Tone } from "./labels";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export const StatusPill = ({ view }: { view: LabelAndTone }) => <Pill tone={view.tone}>{view.label}</Pill>;

export function ErrorNote({ error }: { error: ApiClientError | string }) {
  return (
    <p className="error-note" role="alert">
      {typeof error === "string" ? error : error.message}
    </p>
  );
}

/** Renders a query: a quiet loading line, the error in plain words, or the children with the data. */
export function Loaded<T>({ query, children }: { query: Query<T>; children: (data: T) => ReactNode }) {
  if (query.status === LoadStatus.LOADING) return <p className="loading">Loading…</p>;
  if (query.status === LoadStatus.ERROR) return <ErrorNote error={query.error} />;
  return <>{children(query.data)}</>;
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // No close() on cleanup: closing fires onClose, which would undo the open under StrictMode's double effect.
  // Unmounting removes the dialog anyway.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

/** A labelled list of assumptions ("What I assumed"), hidden when there are none. */
export function Assumptions({ items, title = "What was assumed" }: { items: readonly string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="assumptions">
      <span className="assumptions-title">{title}</span>
      <ul>
        {items.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
