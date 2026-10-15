/**
 * What a bill asks for. The helper's stated total when there is one (the number
 * on the bill, "$626 billed"); otherwise the sum of its lines, which is the claim
 * the lines themselves make. Never trusted: the checker compares the two.
 *
 * Call sites: deriveMonthStatus (billedCents) and Approval.billedCents.
 */
import type { Bill, Cents } from "@helper-assistant/domain";
import { sumCents } from "../money";

export function billedCentsOf(bill: Bill): Cents {
  return bill.statedTotalCents ?? sumOfLinesCentsOf(bill);
}

/**
 * The sum of the bill's lines. This is what gets approved: the stated total is
 * never trusted, so a mis-added total ($626 vs lines $596) approves $596.
 *
 * Call sites: billedCentsOf (fallback), the BILL_APPROVAL proposal (amountApprovedCents).
 */
export function sumOfLinesCentsOf(bill: Bill): Cents {
  return sumCents(bill.lineItems.map((l) => l.amountBilledCents));
}
