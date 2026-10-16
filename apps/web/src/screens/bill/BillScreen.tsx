/**
 * Bill detail: verdict and reasons up top, then the source beside the
 * line-by-line check (Product §7, §8). Actions for an unapproved bill:
 * Approve when it checks out; otherwise "Resolve in chat" first (a new chat about
 * this bill, where the assistant proposes fixes Jordan picks from), "Ask {helper}",
 * and a quiet "Approve anyway…". Approved bills render locked, with no edit controls.
 */
import { useState } from "react";
import { BillStatus, BillVerdict } from "@helper-assistant/domain";
import type { AgreementTerm, Bill, Helper, HelperNote, OutboundMessage, PaymentRecord, SourceDocument } from "@helper-assistant/domain";
import { asClientError, useApiQuery, useApp } from "../../app/AppContext";
import { resolveBillInChat, startChat } from "../../app/chatActions";
import { hrefFor, routes } from "../../app/routes";
import { monthOf } from "../../lib/months";
import { Assumptions, AssumptionsToggle, ErrorNote, Loaded } from "../../ui/common";
import { formatCents, formatInstant, formatPeriod } from "../../ui/format";
import { NOTE_KIND_LABEL } from "../../ui/labels";
import { SourceDocumentView } from "../../ui/SourceDocumentView";
import { MessageList } from "../decisions/MessageList";
import { ApproveDialog } from "./ApproveDialog";
import { CheckHeadline, LockedApproval, SupersededNotice, Totals } from "./BillHeadline";
import { LineChecksTable } from "./LineChecksTable";

type BillData = {
  bill: Bill;
  terms: AgreementTerm[];
  sourceDocument: SourceDocument;
  payment: PaymentRecord | null;
  helper: Helper;
  helpers: Helper[];
  messages: OutboundMessage[];
  notes: HelperNote[];
};

export function BillScreen({ billId }: { billId: string }) {
  const query = useApiQuery(async (api): Promise<BillData> => {
    const detail = await api.call("getBill", { params: { id: billId } });
    const helperId = detail.bill.helperId;
    const [{ helpers }, { messages }, { notes }] = await Promise.all([
      api.call("listHelpers"),
      api.call("listMessages", { query: { helperId } }),
      api.call("listTerms", { query: { helperId } }),
    ]);
    return {
      ...detail,
      helper: helpers.find((h) => h.helperId === helperId)!,
      helpers,
      messages: messages.filter((m) => m.relatedBillId === billId),
      notes: notes.filter((n) => n.billId === billId),
    };
  }, [billId]);
  return (
    <section className="screen">
      <Loaded query={query}>{(data) => <BillView {...data} />}</Loaded>
    </section>
  );
}

function BillView({ bill, terms, sourceDocument, payment, helper, helpers, messages, notes }: BillData) {
  const { api } = useApp();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An approved bill shows what Jordan saw and approved, not a later re-check.
  const check = bill.approval?.checkSnapshot ?? bill.latestCheck;
  const isOpen = bill.status === BillStatus.RECEIVED && check !== null;

  const run = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch (e) {
      setError(asClientError(e).message);
    }
  };
  const askHelper = run(() => startChat(api, `Draft a message to ${helper.name} about the problems on the ${formatPeriod(bill.period)} bill.`));
  const resolveInChat = run(() => resolveBillInChat(api, { bill, check: check!, helper }));

  return (
    <>
      <a className="back" href={hrefFor(routes.home(monthOf(bill.period.start)))}>
        ‹ {formatPeriod(bill.period)}
      </a>
      <header className="bill-head">
        <h1>
          {helper.name} <span className="muted">· {helper.role}</span>
        </h1>
        <p className="muted">
          {formatPeriod(bill.period)} · received {formatInstant(bill.receivedAt)}
        </p>
      </header>

      <SupersededNotice bill={bill} />
      {bill.status === BillStatus.APPROVED && <LockedApproval bill={bill} payment={payment} />}
      {check === null ? <p className="muted">This bill hasn't been checked yet.</p> : bill.status !== BillStatus.APPROVED && <CheckHeadline bill={bill} check={check} />}

      {notes.length > 0 && (
        <ul className="bill-notes">
          {notes.map((n) => (
            <li key={n.noteId}>
              <span className="why-label">{NOTE_KIND_LABEL[n.noteKind]}</span> {n.text}
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <div className="bill-actions">
          {check.verdict === BillVerdict.CHECKS_OUT ? (
            <button type="button" className="primary" onClick={() => setApproving(true)}>
              Approve {formatCents(check.sumOfLinesCents)}
            </button>
          ) : (
            <>
              <button type="button" className="primary" onClick={resolveInChat}>
                Resolve in chat
              </button>
              <button type="button" onClick={askHelper}>
                Ask {helper.name} about this
              </button>
              <button type="button" className="quiet" onClick={() => setApproving(true)}>
                Approve anyway…
              </button>
            </>
          )}
          {error !== null && <ErrorNote error={error} />}
        </div>
      )}

      {check !== null && <Totals check={check} />}

      <div className="side-by-side">
        <section className="pane">
          <h2>What {helper.name} sent</h2>
          <SourceDocumentView docId={sourceDocument.docId} />
          {bill.helperRemarks.length > 0 && <Assumptions title={`${helper.name} also wrote`} items={bill.helperRemarks} />}
        </section>
        <section className="pane">
          <h2>What was read, line by line</h2>
          {check !== null && <LineChecksTable lineItems={bill.lineItems} check={check} terms={terms} />}
          <AssumptionsToggle what="how this bill was read" items={bill.extractionAssumptions} />
        </section>
      </div>

      {messages.length > 0 && (
        <section>
          <h2>Messages about this bill</h2>
          <MessageList messages={messages} helpers={helpers} />
        </section>
      )}
      {approving && isOpen && <ApproveDialog bill={bill} helper={helper} onClose={() => setApproving(false)} />}
    </>
  );
}
