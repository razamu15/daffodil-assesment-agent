/**
 * What a card would change, per action type, in plain words with sources. One
 * renderer per PendingActionType, as a table.
 */
import type { ReactNode } from "react";
import { AgreementChangeKind, ExceptionTarget, PendingActionType } from "@helper-assistant/domain";
import type { AgreementTerm, Helper, PendingAction, PendingActionOf, PendingActionType as PendingActionTypeT, TermContent } from "@helper-assistant/domain";
import { hrefFor, routes } from "../../app/routes";
import { addDays } from "../../lib/dates";
import { formatCents, formatLongDate, formatPeriod } from "../../ui/format";
import { CONTACT_CHANNEL_LABEL, FINDING_TITLE, KEY_REMINDER, MESSAGE_REASON_LABEL } from "../../ui/labels";
import { PricingTable } from "../../ui/PricingTable";
import { describeRule } from "../../ui/rules";
import { SourceToggle } from "../../ui/SourceDocumentView";

export type DetailContext = {
  helpers: Helper[];
  terms: AgreementTerm[];
  /** HELPER_MESSAGE: the editable body, while the card is pending. */
  messageBody: string;
  onMessageBodyChange: ((body: string) => void) | null;
};

const rulesText = (term: Pick<TermContent, "pricingRules">) => term.pricingRules.map(describeRule).join(" · ");

/** The proposed term: its price as a table, the words it came from, and the source. */
function TermProposal({ term, caption }: { term: TermContent; caption: string }) {
  return (
    <div className="proposal-term">
      <PricingTable term={term} caption={`${caption}: ${term.serviceLabel}`} />
      <blockquote className="quote">“{term.sourceQuote}”</blockquote>
      <SourceToggle docId={term.sourceDocId} quote={term.sourceQuote} />
    </div>
  );
}

type Renderer<T extends PendingActionTypeT> = (action: PendingActionOf<T>, ctx: DetailContext) => ReactNode;

const DETAILS: { [T in PendingActionTypeT]: Renderer<T> } = {
  [PendingActionType.AGREEMENT_CHANGE]: (action, { terms }) => {
    const change = action.payload;
    if (change.change === AgreementChangeKind.END_TERM) {
      const ended = terms.find((t) => t.termId === change.termId);
      return (
        <p>
          Ends {ended?.serviceLabel ?? "this agreement"} after {formatLongDate(change.effectiveTo)}.
        </p>
      );
    }
    if (change.change === AgreementChangeKind.ADD_EARLIER_TERM) {
      const current = terms.find((t) => t.termId === change.currentTermId);
      return (
        <>
          <TermProposal term={change.term} caption="Earlier rate" />
          {current !== undefined && change.term.effectiveTo !== null && (
            <p className="muted small">
              The current {current.serviceLabel} rate ({rulesText(current)}) will start {formatLongDate(addDays(change.term.effectiveTo, 1))} instead of {formatLongDate(current.effectiveFrom)}.
            </p>
          )}
        </>
      );
    }
    const replaced = change.change === AgreementChangeKind.REPLACE_TERM ? terms.find((t) => t.termId === change.supersedesTermId) : undefined;
    return (
      <>
        {replaced !== undefined && <PricingTable term={replaced} caption={`Now: ${replaced.serviceLabel}`} />}
        <TermProposal term={change.term} caption={replaced !== undefined ? "Proposed" : "New"} />
      </>
    );
  },
  [PendingActionType.BILL_APPROVAL]: (action) => (
    <>
      <p>
        Approve <strong>{formatCents(action.payload.amountApprovedCents)}</strong>. <a href={hrefFor(routes.bill(action.payload.billId))}>Open the bill</a>
      </p>
      {action.payload.acceptedExceptions.length > 0 && (
        <ul>
          {action.payload.acceptedExceptions.map((e) => (
            <li key={e.target === ExceptionTarget.LINE ? e.lineId : e.findingKind}>
              {e.target === ExceptionTarget.LINE ? "A line" : FINDING_TITLE[e.findingKind]}: “{e.reason}”
            </li>
          ))}
        </ul>
      )}
    </>
  ),
  [PendingActionType.HELPER_MESSAGE]: (action, { helpers, messageBody, onMessageBodyChange }) => {
    const helper = helpers.find((h) => h.helperId === action.payload.helperId);
    return (
      <>
        <p className="muted small">
          {MESSAGE_REASON_LABEL[action.payload.reason]} · to {helper?.name ?? "the helper"} by {CONTACT_CHANNEL_LABEL[action.payload.channelHint].toLowerCase()}
          {action.payload.relatedPeriod !== null && <> · {formatPeriod(action.payload.relatedPeriod)}</>}
        </p>
        {onMessageBodyChange === null ? (
          <blockquote className="message-body">{messageBody}</blockquote>
        ) : (
          <textarea className="message-edit" rows={4} value={messageBody} onChange={(e) => onMessageBodyChange(e.target.value)} aria-label="Message text" />
        )}
        <p className="muted small">Confirming doesn't send it. You'll copy it or open it in Messages.</p>
      </>
    );
  },
  [PendingActionType.HELPER_ENGAGEMENT_END]: (action, { helpers }) => {
    const name = helpers.find((h) => h.helperId === action.payload.helperId)?.name ?? "This helper";
    const reminder = KEY_REMINDER[action.payload.houseKeyAccess];
    return (
      <>
        <dl className="facts">
          <dt>Last day</dt>
          <dd>{formatLongDate(action.payload.endedOn)}</dd>
          <dt>Final bill expected for</dt>
          <dd>{formatPeriod(action.payload.finalPeriod)}</dd>
        </dl>
        {reminder !== null && <p className="key-reminder">🔑 {reminder(name)}</p>}
      </>
    );
  },
};

export function ActionDetails({ action, ctx }: { action: PendingAction; ctx: DetailContext }) {
  return <div className="action-details">{(DETAILS[action.type] as Renderer<PendingActionTypeT>)(action as never, ctx)}</div>;
}
