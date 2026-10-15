/**
 * The top of the Bill screen: why it was flagged (or that it checks out), in
 * plain words, readable in five seconds. For an approved bill: the locked
 * approval, with accepted exceptions and their reasons, and payment.
 */
import { BillStatus, BillVerdict, ExceptionTarget } from "@helper-assistant/domain";
import type { AcceptedException, Bill, BillCheck, PaymentRecord } from "@helper-assistant/domain";
import { hrefFor, routes } from "../../app/routes";
import { groupedReasons, informationalItems, itemsNeedingDecision, lineTitle } from "../../ui/checkItems";
import { formatCents, formatInstant, formatLongDate, plural } from "../../ui/format";
import { FINDING_TITLE, PAYMENT_METHOD_LABEL, RESOLVER_LABEL, VERDICT_VIEW } from "../../ui/labels";

export function CheckHeadline({ bill, check }: { bill: Bill; check: BillCheck }) {
  const decisions = itemsNeedingDecision(check, bill.lineItems);
  const notes = informationalItems(check, bill.lineItems);
  const view = VERDICT_VIEW[check.verdict];
  // What the lines ask for beyond what the agreements support, e.g. Lupe's "$20 over".
  const over = check.agreedTotalCents === null ? null : check.sumOfLinesCents - check.agreedTotalCents;
  return (
    <div className={`headline tone-${view.tone}`}>
      <h2>
        {check.verdict === BillVerdict.CHECKS_OUT ? "✓ Checks out. Rates and math match your agreements." : `⚠ ${plural(decisions.length, "thing")} to look at`}
      </h2>
      {over !== null && over > 0 && (
        <p className="headline-over">
          {formatCents(over)} more than your agreements support ({formatCents(check.agreedTotalCents!)}).
        </p>
      )}
      {decisions.length > 0 && (
        <ul className="headline-items">
          {groupedReasons(decisions).map((d) => (
            <li key={d.titles}>
              <strong>{d.titles}:</strong> {d.short}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="headline-notes">
          {notes.map((n) => (
            <li key={n.key}>
              <span className="note-label">Note</span> {n.explanation}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Totals({ check }: { check: BillCheck }) {
  const totalOff = check.statedTotalCents !== null && check.statedTotalCents !== check.sumOfLinesCents;
  return (
    <dl className="totals">
      <div>
        <dt>Billed total</dt>
        <dd className={totalOff ? "bad" : undefined}>{check.statedTotalCents === null ? "Not stated" : formatCents(check.statedTotalCents)}</dd>
      </div>
      <div>
        <dt>Lines add up to</dt>
        <dd>{formatCents(check.sumOfLinesCents)}</dd>
      </div>
      <div>
        <dt>Your agreements support</dt>
        <dd>{check.agreedTotalCents === null ? "Can't say yet" : formatCents(check.agreedTotalCents)}</dd>
      </div>
    </dl>
  );
}

function exceptionTitle(bill: Bill, exception: AcceptedException): string {
  if (exception.target === ExceptionTarget.FINDING) return FINDING_TITLE[exception.findingKind];
  const line = bill.lineItems.find((l) => l.lineId === exception.lineId);
  return line === undefined ? "A line" : lineTitle(line);
}

/** Approved bills look locked: no edit controls render (Product §8). */
export function LockedApproval({ bill, payment }: { bill: Bill; payment: PaymentRecord | null }) {
  const approval = bill.approval!;
  return (
    <div className="locked">
      <h2>🔒 Approved for payment</h2>
      <p>
        {formatCents(approval.amountApprovedCents)} approved by {RESOLVER_LABEL[approval.approvedBy]} on {formatInstant(approval.approvedAt)}
        {approval.billedCents !== approval.amountApprovedCents && <> (billed {formatCents(approval.billedCents)})</>}. This bill is sealed and can't be changed.
      </p>
      {approval.acceptedExceptions.length > 0 && (
        <div className="accepted">
          <span className="why-label">Accepted as exceptions</span>
          <ul>
            {approval.acceptedExceptions.map((e) => (
              <li key={e.target === ExceptionTarget.LINE ? e.lineId : e.findingKind}>
                <strong>{exceptionTitle(bill, e)}</strong>: “{e.reason}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="payment-line">
        {payment === null ? (
          <>
            Not marked paid yet. <a href={hrefFor(routes.bills())}>Mark as paid on Bills</a> once you've paid.
          </>
        ) : (
          <>
            Paid {formatLongDate(payment.paidOn)} by {PAYMENT_METHOD_LABEL[payment.method]}
            {payment.note !== null && <> · {payment.note}</>}
          </>
        )}
      </p>
    </div>
  );
}

export function SupersededNotice({ bill }: { bill: Bill }) {
  if (bill.status !== BillStatus.SUPERSEDED) return null;
  return (
    <div className="headline tone-muted">
      <h2>Replaced by a corrected bill</h2>
      <p>
        This bill is kept for the record.{" "}
        {bill.supersededByBillId !== null && <a href={hrefFor(routes.bill(bill.supersededByBillId))}>Open the corrected bill</a>}
      </p>
    </div>
  );
}
