/**
 * Bills: every bill by month, including approved, paid and replaced ones
 * (Product §7, P13). Mark as paid lives here, on approved bills.
 */
import { useState } from "react";
import { BillStatus } from "@helper-assistant/domain";
import type { Bill, Helper, PaymentRecord } from "@helper-assistant/domain";
import { useApiQuery } from "../../app/AppContext";
import { hrefFor, routes } from "../../app/routes";
import { monthOf } from "../../lib/months";
import { Loaded, StatusPill } from "../../ui/common";
import { formatCents, formatLongDate, formatMonth, formatPeriod } from "../../ui/format";
import { PAYMENT_METHOD_LABEL, Tone, VERDICT_VIEW } from "../../ui/labels";
import type { LabelAndTone } from "../../ui/labels";
import { MarkPaidForm } from "./MarkPaidForm";

type BillsData = { bills: Bill[]; payments: PaymentRecord[]; helpers: Helper[] };

/** One bill's state for this list: the stored status, with the check's verdict for open bills and payment for approved ones. */
function billStateView(bill: Bill, payment: PaymentRecord | null): LabelAndTone {
  if (bill.status === BillStatus.SUPERSEDED) return { label: "Replaced by a corrected bill", tone: Tone.MUTED };
  if (bill.status === BillStatus.APPROVED) return payment === null ? { label: "Approved, not marked paid", tone: Tone.DONE } : { label: "Paid", tone: Tone.DONE };
  return bill.latestCheck === null ? { label: "Not checked yet", tone: Tone.INFO } : VERDICT_VIEW[bill.latestCheck.verdict];
}

export function BillsScreen() {
  const query = useApiQuery(async (api): Promise<BillsData> => {
    const [{ bills, payments }, { helpers }] = await Promise.all([api.call("listBills"), api.call("listHelpers")]);
    return { bills, payments, helpers };
  }, []);
  return (
    <section className="screen">
      <h1>Bills</h1>
      <Loaded query={query}>{(data) => <BillsByMonth {...data} />}</Loaded>
    </section>
  );
}

function BillsByMonth({ bills, payments, helpers }: BillsData) {
  if (bills.length === 0) return <p className="muted">No bills yet. Drop one into the assistant when it arrives.</p>;
  const months = [...new Set(bills.map((b) => monthOf(b.period.start)))].sort().reverse();
  return (
    <>
      {months.map((month) => (
        <section key={month} className="bills-month">
          <h2>{formatMonth(month)}</h2>
          <ul className="bill-list">
            {bills
              .filter((b) => monthOf(b.period.start) === month)
              .map((bill) => (
                <BillListItem
                  key={bill.billId}
                  bill={bill}
                  helper={helpers.find((h) => h.helperId === bill.helperId)!}
                  payment={payments.find((p) => p.billId === bill.billId) ?? null}
                />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function BillListItem({ bill, helper, payment }: { bill: Bill; helper: Helper; payment: PaymentRecord | null }) {
  const [paying, setPaying] = useState(false);
  const view = billStateView(bill, payment);
  const billed = bill.statedTotalCents ?? bill.latestCheck?.sumOfLinesCents ?? null;
  return (
    <li className={`bill-item${bill.status === BillStatus.SUPERSEDED ? " superseded" : ""}`}>
      <div className="bill-item-main">
        <a href={hrefFor(routes.bill(bill.billId))} className="bill-item-who">
          <strong>{helper.name}</strong> <span className="muted">· {formatPeriod(bill.period)}</span>
        </a>
        <StatusPill view={view} />
        <span className="bill-item-amounts">
          {billed !== null && <span>{formatCents(billed)} billed</span>}
          {bill.approval !== null && <span>{formatCents(bill.approval.amountApprovedCents)} approved</span>}
        </span>
        {bill.status === BillStatus.APPROVED && payment === null && !paying && (
          <button type="button" className="primary" onClick={() => setPaying(true)}>
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
      {paying && <MarkPaidForm bill={bill} helper={helper} onDone={() => setPaying(false)} />}
    </li>
  );
}
