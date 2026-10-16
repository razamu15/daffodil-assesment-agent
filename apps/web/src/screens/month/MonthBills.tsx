/**
 * Every bill for the month, including approved, paid and replaced ones (Product
 * §7, P13): what used to be the Bills screen, now part of the month. Mark as
 * paid lives here, on approved bills.
 *
 * Call site: HomeScreen.
 */
import { BillStatus } from "@helper-assistant/domain";
import type { Bill, Helper, Id, PaymentRecord } from "@helper-assistant/domain";
import { hrefFor, routes } from "../../app/routes";
import { billedCents } from "../../ui/billAmounts";
import { StatusPill } from "../../ui/common";
import { formatCents, formatLongDate, formatMonth, formatPeriod } from "../../ui/format";
import { PAYMENT_METHOD_LABEL, Tone, VERDICT_VIEW } from "../../ui/labels";
import type { LabelAndTone } from "../../ui/labels";
import { MarkPaidForm } from "./MarkPaidForm";

/** One bill's state for this list: the stored status, with the check's verdict for open bills and payment for approved ones. */
function billStateView(bill: Bill, payment: PaymentRecord | null): LabelAndTone {
  if (bill.status === BillStatus.SUPERSEDED) return { label: "Replaced by a corrected bill", tone: Tone.MUTED };
  if (bill.status === BillStatus.APPROVED) return payment === null ? { label: "Approved, not marked paid", tone: Tone.DONE } : { label: "Paid", tone: Tone.DONE };
  return bill.latestCheck === null ? { label: "Not checked yet", tone: Tone.INFO } : VERDICT_VIEW[bill.latestCheck.verdict];
}

type Props = {
  month: string;
  bills: Bill[];
  payments: PaymentRecord[];
  helpers: Helper[];
  /** The bill whose Mark as paid form is open (also opened from a month row's button). */
  payingBillId: Id | null;
  onPay: (billId: Id | null) => void;
};

export function MonthBills({ month, bills, payments, helpers, payingBillId, onPay }: Props) {
  return (
    <section className="month-bills">
      <h2>Bills for {formatMonth(month)}</h2>
      {bills.length === 0 ? (
        <p className="muted">No bills for this month yet. Drop one into the assistant when it arrives.</p>
      ) : (
        <ul className="bill-list">
          {bills.map((bill) => (
            <BillListItem
              key={bill.billId}
              bill={bill}
              helper={helpers.find((h) => h.helperId === bill.helperId)!}
              payment={payments.find((p) => p.billId === bill.billId) ?? null}
              paying={payingBillId === bill.billId}
              onPay={onPay}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BillListItem({ bill, helper, payment, paying, onPay }: { bill: Bill; helper: Helper; payment: PaymentRecord | null; paying: boolean; onPay: Props["onPay"] }) {
  const view = billStateView(bill, payment);
  const billed = billedCents(bill);
  return (
    <li id={`bill-${bill.billId}`} className={`bill-item${bill.status === BillStatus.SUPERSEDED ? " superseded" : ""}`}>
      <div className="bill-item-main">
        <a href={hrefFor(routes.bill(bill.billId))} className="bill-item-who">
          <strong>{helper.name}</strong> <span className="muted">· {formatPeriod(bill.period)}</span>
        </a>
        <StatusPill view={view} />
        <span className="bill-item-amounts">
          <span>{formatCents(billed)} billed</span>
          {bill.approval !== null && <span>{formatCents(bill.approval.amountApprovedCents)} approved</span>}
        </span>
        {bill.status === BillStatus.APPROVED && payment === null && !paying && (
          <button type="button" className="primary" onClick={() => onPay(bill.billId)}>
            Mark as paid
          </button>
        )}
      </div>
      {payment !== null && (
        <p className="muted small">
          Paid {formatLongDate(payment.paidOn)} by {PAYMENT_METHOD_LABEL[payment.method]}
          {payment.note !== null && <> · {payment.note}</>}
        </p>
      )}
      {paying && <MarkPaidForm bill={bill} helper={helper} onDone={() => onPay(null)} />}
    </li>
  );
}
