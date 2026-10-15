/**
 * A confirm card for one PendingAction: what it changes, what was assumed,
 * Confirm / Reject. Confirm sends the version Jordan saw; a STALE outcome is
 * shown in place with its reason (it's a normal result, not an error).
 *
 * Call sites: Decisions screen (grouped by target), Chat (cards inline).
 */
import { useState } from "react";
import { ApiErrorCode, PendingActionStatus, PendingActionType } from "@helper-assistant/domain";
import type { AgreementTerm, Helper, PendingAction, PendingActionType as PendingActionTypeT } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { Assumptions, ErrorNote, StatusPill } from "../../ui/common";
import { formatInstant } from "../../ui/format";
import { ACTION_STATUS_VIEW, ACTION_TYPE_LABEL, RESOLVER_LABEL } from "../../ui/labels";
import { SourceToggle } from "../../ui/SourceDocumentView";
import { ActionDetails } from "./ActionDetails";

const CONFIRM_LABEL: Record<PendingActionTypeT, string> = {
  [PendingActionType.AGREEMENT_CHANGE]: "Confirm change",
  [PendingActionType.BILL_APPROVAL]: "Approve",
  [PendingActionType.HELPER_MESSAGE]: "Confirm message",
  [PendingActionType.HELPER_ENGAGEMENT_END]: "Confirm last day",
};

const draftBodyOf = (action: PendingAction): string => (action.type === PendingActionType.HELPER_MESSAGE ? action.payload.body : "");

export function ActionCard({ action, helpers, terms }: { action: PendingAction; helpers: Helper[]; terms: AgreementTerm[] }) {
  const { api, refresh } = useApp();
  const [body, setBody] = useState(draftBodyOf(action));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = action.status === PendingActionStatus.PENDING;

  const resolve = async (confirm: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (confirm) {
        const edited = action.type === PendingActionType.HELPER_MESSAGE && body.trim() !== draftBodyOf(action) ? body.trim() : null;
        await api.call("confirmAction", { params: { ref: action.ref }, body: { actionVersion: action.version, messageBody: edited } });
      } else {
        await api.call("rejectAction", { params: { ref: action.ref }, body: { actionVersion: action.version } });
      }
      refresh();
    } catch (e) {
      const failure = asClientError(e);
      setError(failure.code === ApiErrorCode.ACTION_NOT_PENDING ? "This card was already resolved. Showing the latest." : failure.message);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`action-card${pending ? " pending" : " resolved"}`}>
      <header className="action-head">
        <span className="action-type">{ACTION_TYPE_LABEL[action.type]}</span>
        <span className="muted small">#{action.ref}</span>
        <StatusPill view={ACTION_STATUS_VIEW[action.status]} />
      </header>
      <h3 className="action-summary">{action.summary}</h3>
      <ActionDetails action={action} ctx={{ helpers, terms, messageBody: body, onMessageBodyChange: pending ? setBody : null }} />
      <Assumptions items={action.assumptions} />
      {action.sourceDocId !== null && action.type !== PendingActionType.AGREEMENT_CHANGE && <SourceToggle docId={action.sourceDocId} label="Show what this came from" />}
      {!pending && (
        <p className="muted small">
          {ACTION_STATUS_VIEW[action.status].label}
          {action.resolvedBy !== null && <> by {RESOLVER_LABEL[action.resolvedBy]}</>}
          {action.resolvedAt !== null && <> on {formatInstant(action.resolvedAt)}</>}.
        </p>
      )}
      {action.resolutionNote !== null && <p className="resolution-note">{action.resolutionNote}</p>}
      {error !== null && <ErrorNote error={error} />}
      {pending && (
        <div className="action-buttons">
          <button type="button" className="primary" disabled={busy || (action.type === PendingActionType.HELPER_MESSAGE && body.trim() === "")} onClick={() => resolve(true)}>
            {CONFIRM_LABEL[action.type]}
          </button>
          <button type="button" disabled={busy} onClick={() => resolve(false)}>
            Reject
          </button>
        </div>
      )}
    </article>
  );
}
