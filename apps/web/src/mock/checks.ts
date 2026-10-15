/**
 * Bill checks for the mock, produced by Track A's real checker (pure code) so the
 * UI renders realistic latestCheck data instead of hand-written checks. Only the
 * mock imports @helper-assistant/core; app code renders what the API returns.
 *
 * Call sites: scenario builders (initial checks), apply.ts (re-check after an
 * agreement change).
 */
import { checkBill } from "@helper-assistant/core";
import { BillStatus } from "@helper-assistant/domain";
import type { Bill, Id } from "@helper-assistant/domain";
import { rangesOverlap } from "../lib/months";
import type { MockWorld } from "./world";

function approvedOverlappingBillId(world: MockWorld, bill: Bill): Id | null {
  const approved = world.bills.find(
    (other) =>
      other.billId !== bill.billId &&
      other.helperId === bill.helperId &&
      other.status === BillStatus.APPROVED &&
      rangesOverlap(other.period, bill.period),
  );
  return approved?.billId ?? null;
}

/** The bill with a fresh latestCheck against every version of its helper's terms. */
export function withCheck(world: MockWorld, bill: Bill): Bill {
  const terms = world.terms.filter((t) => t.helperId === bill.helperId);
  const latestCheck = checkBill({ bill, terms, approvedOverlappingBillId: approvedOverlappingBillId(world, bill), checkedAt: world.now() });
  return { ...bill, latestCheck };
}
