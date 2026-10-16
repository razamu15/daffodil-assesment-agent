/**
 * "Mark as paid" on an approved bill (Product §4.6a): date, method, optional
 * note. No confirm step: the click is Jordan's own statement. It records the
 * payment; it moves no money. The date starts empty: we don't guess when Jordan paid.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { PaymentMethod } from "@helper-assistant/domain";
import type { Bill, Helper, PaymentMethod as PaymentMethodT } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { ErrorNote } from "../../ui/common";
import { formatCents } from "../../ui/format";
import { PAYMENT_METHOD_LABEL } from "../../ui/labels";

/** Methods Jordan can say they paid with. UNKNOWN isn't a way to pay. */
const PAYABLE_METHODS: readonly PaymentMethodT[] = [PaymentMethod.VENMO, PaymentMethod.ZELLE, PaymentMethod.OTHER];

export function MarkPaidForm({ bill, helper, onDone }: { bill: Bill; helper: Helper; onDone: () => void }) {
  const { api, refresh } = useApp();
  // The helper's recorded method is a fact, so it's preselected; an unrecorded one is left for Jordan to pick.
  const [method, setMethod] = useState<PaymentMethodT | "">(PAYABLE_METHODS.includes(helper.payment.method) ? helper.payment.method : "");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (method === "") return;
    setBusy(true);
    try {
      await api.call("recordPayment", { params: { id: bill.billId }, body: { paidOn, method, note: note.trim() === "" ? null : note.trim() } });
      refresh();
      onDone();
    } catch (e) {
      setError(asClientError(e).message);
      setBusy(false);
    }
  };

  return (
    <form className="mark-paid" onSubmit={submit}>
      <p>
        Record that you paid {helper.name} {formatCents(bill.approval!.amountApprovedCents)}. This doesn't move any money.
      </p>
      <label className="field">
        <span>Paid on</span>
        <input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </label>
      <label className="field">
        <span>How</span>
        <select required value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodT)}>
          <option value="" disabled>
            Choose…
          </option>
          {PAYABLE_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <input type="text" value={note} placeholder="e.g. Venmo ref 1234" onChange={(e) => setNote(e.target.value)} />
      </label>
      {error !== null && <ErrorNote error={error} />}
      <div className="form-actions">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || paidOn === "" || method === ""}>
          Mark as paid
        </button>
      </div>
    </form>
  );
}
