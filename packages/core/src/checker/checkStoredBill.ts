/**
 * Runs checkBill on a stored bill with everything it needs from the Store: the
 * helper's terms (all versions) and any approved bill overlapping its period.
 *
 * Call sites: the agent's check_bill tool (checkBillById), recordBill, the
 * BILL_APPROVAL propose and confirm paths, AGREEMENT_CHANGE apply.
 */
import { BillStatus } from "@helper-assistant/domain";
import type { Bill, BillCheck, Id } from "@helper-assistant/domain";
import { rangesOverlap } from "../calendar";
import type { CoreDeps } from "../deps";
import { notFound } from "../errors";
import { checkBill } from "./checkBill";

export async function checkStoredBill({ store, clock }: Pick<CoreDeps, "store" | "clock">, bill: Bill): Promise<BillCheck> {
  const [terms, approved] = await Promise.all([
    store.listTerms({ helperId: bill.helperId }),
    store.listBills({ helperId: bill.helperId, status: BillStatus.APPROVED }),
  ]);
  const overlapping = approved.find((b) => b.billId !== bill.billId && rangesOverlap(b.period, bill.period));
  return checkBill({ bill, terms, approvedOverlappingBillId: overlapping?.billId ?? null, checkedAt: clock.now() });
}

/** check_bill: a fresh check of the bill as it stands now. Read-only; latestCheck is not rewritten. */
export async function checkBillById(deps: Pick<CoreDeps, "store" | "clock">, billId: Id): Promise<BillCheck> {
  const bill = await deps.store.getBill(billId);
  if (bill === null) throw notFound("Bill", billId);
  return checkStoredBill(deps, bill);
}
