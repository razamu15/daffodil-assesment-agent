/**
 * What a bill asks for, as the API computes it (core billedCentsOf): the stated
 * total when the bill has one, else the sum of its lines. Mirrored here because
 * core stays out of the production bundle.
 *
 * Call sites: month/MonthBills.tsx (the list), month/MonthCharts.tsx (the charts).
 */
import type { Bill, Cents } from "@helper-assistant/domain";

export const billedCents = (bill: Bill): Cents => bill.statedTotalCents ?? bill.lineItems.reduce((sum, line) => sum + line.amountBilledCents, 0);
