/**
 * The approve confirm dialog (Product §4.6): who, how to pay, how much, and any
 * accepted exceptions, each with Jordan's reason. "Approve anyway…" is this same
 * dialog on a flagged bill: every item needing a decision must get a reason.
 *
 * The amount is the sum of the lines (Product P15); the stated total is shown as
 * "billed" when it differs. Approving locks the bill; it pays nobody.
 *
 * Call sites: Bill screen (Approve / Approve anyway…), Month screen (Approve on a clean row).
 */
import { useState } from "react";
import { PaymentMethod, PendingActionStatus } from "@helper-assistant/domain";
import type { AcceptedException, Bill, Helper } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { hrefFor, routes } from "../../app/routes";
import type { ApiClientError } from "../../api/client";
import { informationalItems, itemsNeedingDecision } from "../../ui/checkItems";
import { Dialog, ErrorNote } from "../../ui/common";
import { formatCents, formatPeriod } from "../../ui/format";
import { PAYMENT_METHOD_LABEL } from "../../ui/labels";

type Props = { bill: Bill; helper: Helper; onClose: () => void };

export function ApproveDialog({ bill, helper, onClose }: Props) {
  const { api, refresh } = useApp();
  const check = bill.latestCheck!;
  const decisions = itemsNeedingDecision(check, bill.lineItems);
  const notes = informationalItems(check, bill.lineItems);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [staleNote, setStaleNote] = useState<string | null>(null);

  const allReasoned = decisions.every((d) => (reasons[d.key] ?? "").trim() !== "");
  const billed = check.statedTotalCents;
  const amount = check.sumOfLinesCents;

  const approve = async () => {
    setBusy(true);
    setError(null);
    const acceptedExceptions: AcceptedException[] = decisions.map((d) => ({ ...d.covers, reason: reasons[d.key]!.trim() }));
    try {
      const { action } = await api.call("approveBill", { params: { id: bill.billId }, body: { billVersion: bill.version, acceptedExceptions } });
      if (action.status === PendingActionStatus.STALE) {
        setStaleNote(action.resolutionNote ?? "Something changed before the approval went through. Look at the bill again.");
        setBusy(false);
        return;
      }
      refresh();
      onClose();
    } catch (e) {
      setError(asClientError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={decisions.length > 0 ? "Approve anyway?" : "Approve for payment?"} onClose={onClose}>
      <dl className="approve-facts">
        <dt>Who</dt>
        <dd>
          {helper.name} <span className="muted">({helper.role})</span> · {formatPeriod(bill.period)}
        </dd>
        <dt>How to pay</dt>
        <dd>
          {helper.payment.method === PaymentMethod.UNKNOWN ? (
            <>
              Not recorded. <a href={hrefFor(routes.agreements(helper.helperId))}>Add it on Agreements</a>.
            </>
          ) : (
            <>
              {PAYMENT_METHOD_LABEL[helper.payment.method]}
              {helper.payment.handle !== null && <> · {helper.payment.handle}</>}
            </>
          )}
        </dd>
        <dt>Amount</dt>
        <dd>
          <span className="approve-amount">{formatCents(amount)}</span>
          {billed !== null && billed !== amount && (
            <span className="approve-billed">
              Billed {formatCents(billed)}. You approve what the lines add up to, {formatCents(amount)}, not the stated total.
            </span>
          )}
        </dd>
      </dl>

      {decisions.length > 0 && (
        <section className="exceptions">
          <h3>You're accepting {decisions.length === 1 ? "this" : `these ${decisions.length}`} as exceptions</h3>
          <p className="muted">Each needs a reason. It's kept with the approval.</p>
          {decisions.map((d) => (
            <label key={d.key} className="exception">
              <span className="exception-title">{d.title}</span>
              <span className="exception-why">{d.explanation}</span>
              <textarea
                rows={2}
                placeholder="Why it's OK (e.g. “Sam did OK the fee”)"
                value={reasons[d.key] ?? ""}
                onChange={(e) => setReasons({ ...reasons, [d.key]: e.target.value })}
              />
            </label>
          ))}
        </section>
      )}

      {notes.length > 0 && (
        <section className="info-notes">
          <h3>For your information</h3>
          <ul>
            {notes.map((n) => (
              <li key={n.key}>{n.explanation}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="lock-note">Approving locks this bill so it can't change. It doesn't pay anyone: you pay {helper.name} yourself, then mark it paid.</p>
      {staleNote !== null && <ErrorNote error={staleNote} />}
      {error !== null && <ErrorNote error={error} />}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={busy || !allReasoned || staleNote !== null} onClick={approve}>
          {busy ? "Approving…" : `Approve ${formatCents(amount)}`}
        </button>
      </div>
    </Dialog>
  );
}
