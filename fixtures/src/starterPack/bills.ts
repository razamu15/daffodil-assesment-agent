/**
 * Expected September bills as recorded by record_bill (before any check). These
 * are the helpers' claims, verbatim in structure; nothing here is "corrected".
 */
import { BillPeriodKind, BillStatus, LineKind } from "@helper-assistant/domain";
import type { Bill, BillingPeriod, LineItem } from "@helper-assistant/domain";
import { docIds, STARTER_PACK_UPLOADED_AT } from "./documents";
import { helperIds } from "./people";
import { serviceKeys } from "./terms";

export const billIds = {
  priya: "bill-priya-2026-09",
  lupe: "bill-lupe-2026-09",
  theo: "bill-theo-2026-09",
} as const;

export const SEPTEMBER_2026: BillingPeriod = { start: "2026-09-01", end: "2026-09-30", kind: BillPeriodKind.CALENDAR_MONTH };

const recorded = {
  period: SEPTEMBER_2026,
  status: BillStatus.RECEIVED,
  supersedesBillId: null,
  supersededByBillId: null,
  receivedAt: STARTER_PACK_UPLOADED_AT,
  latestCheck: null,
  approval: null,
  version: 1,
} as const;

const line = (l: Partial<LineItem> & Pick<LineItem, "lineId" | "label" | "amountBilledCents" | "sourceQuote">): LineItem => ({
  lineKind: LineKind.SERVICE,
  serviceKey: null,
  serviceDate: null,
  startAt: null,
  endAt: null,
  quantity: null,
  unit: null,
  unitPriceBilledCents: null,
  authorizationClaim: null,
  relatedLineId: null,
  ...l,
});

export const priyaLineIds = { sep4: "priya-l1", sep9: "priya-l2", sep12: "priya-l3", sep20: "priya-l4", fee: "priya-l5", sep25: "priya-l6" } as const;
export const lupeLineIds = { sep1: "lupe-l1", sep8: "lupe-l2", sep15: "lupe-l3", sep22: "lupe-l4", sep29: "lupe-l5" } as const;
export const theoLineIds = { walk30: "theo-l1", walk60: "theo-l2" } as const;

const hours = (n: number) => ({ quantity: n, unit: "HOUR" as const });

export const starterPackBills: Bill[] = [
  {
    ...recorded,
    billId: billIds.priya,
    helperId: helperIds.priya,
    sourceDocId: docIds.priyaBill,
    statedTotalCents: 62600,
    lineItems: [
      line({ lineId: priyaLineIds.sep4, serviceKey: serviceKeys.priyaDateNight, label: "date night", serviceDate: "2026-09-04", startAt: "2026-09-04T18:00", endAt: "2026-09-04T23:30", ...hours(5.5), amountBilledCents: 11400, sourceQuote: "Fri 9/4 date night 6–11:30pm — $114" }),
      line({ lineId: priyaLineIds.sep9, serviceKey: serviceKeys.priyaStandard, label: "after school", serviceDate: "2026-09-09", startAt: "2026-09-09T15:00", endAt: "2026-09-09T19:00", ...hours(4), amountBilledCents: 8800, sourceQuote: "Wed 9/9 after school 3–7pm — $88" }),
      line({ lineId: priyaLineIds.sep12, serviceKey: serviceKeys.priyaStandard, label: "Sat 9/12", serviceDate: "2026-09-12", startAt: "2026-09-12T19:00", endAt: "2026-09-13T00:00", ...hours(5), amountBilledCents: 12200, sourceQuote: "Sat 9/12 7pm–12am — $122" }),
      line({ lineId: priyaLineIds.sep20, serviceKey: serviceKeys.priyaStandard, label: "Sun 9/20", serviceDate: "2026-09-20", startAt: "2026-09-20T10:00", endAt: "2026-09-20T14:00", ...hours(4), amountBilledCents: 13200, sourceQuote: "Sun 9/20 10am–2pm — $132" }),
      line({
        lineId: priyaLineIds.fee,
        lineKind: LineKind.FEE,
        label: "last minute fee",
        serviceDate: "2026-09-20",
        amountBilledCents: 4000,
        relatedLineId: priyaLineIds.sep20,
        authorizationClaim: { claimedApprover: "Sam", text: "Sam said that was fine since it was same-day!" },
        sourceQuote: "+ last minute fee $40 (Sam said that was fine since it was same-day!)",
      }),
      line({ lineId: priyaLineIds.sep25, serviceKey: serviceKeys.priyaDateNight, label: "date night", serviceDate: "2026-09-25", startAt: "2026-09-25T18:00", endAt: "2026-09-25T23:00", ...hours(5), amountBilledCents: 10000, sourceQuote: "Fri 9/25 date night 6–11pm — $100" }),
    ],
    extractionAssumptions: [
      "Period read as September 2026 from 'Here's September' in a text dated Thu Oct 1.",
      "Sat 9/12 isn't labeled date night, so it's read as standard babysitting.",
      "'12am' read as midnight at the end of Sat 9/12 (2026-09-13T00:00).",
    ],
    helperRemarks: ["Venmo is great, thank you!!"],
  },
  {
    ...recorded,
    billId: billIds.lupe,
    helperId: helperIds.lupe,
    sourceDocId: docIds.lupeBill,
    statedTotalCents: 82000,
    lineItems: [
      line({ lineId: lupeLineIds.sep1, serviceKey: serviceKeys.lupeRegular, label: "Sep 1", serviceDate: "2026-09-01", quantity: 1, unit: "VISIT", amountBilledCents: 15000, sourceQuote: "Sep 1 – $150" }),
      line({ lineId: lupeLineIds.sep8, serviceKey: serviceKeys.lupeRegular, label: "Sep 8", serviceDate: "2026-09-08", quantity: 1, unit: "VISIT", amountBilledCents: 15000, sourceQuote: "Sep 8 – $150" }),
      line({ lineId: lupeLineIds.sep15, serviceKey: serviceKeys.lupeRegular, label: "Sep 15", serviceDate: "2026-09-15", quantity: 1, unit: "VISIT", amountBilledCents: 15000, sourceQuote: "Sep 15 – $150" }),
      line({ lineId: lupeLineIds.sep22, serviceKey: serviceKeys.lupeDeep, label: "Sep 22 deep", serviceDate: "2026-09-22", quantity: 1, unit: "VISIT", amountBilledCents: 22000, sourceQuote: "Sep 22 deep – $220" }),
      line({ lineId: lupeLineIds.sep29, serviceKey: serviceKeys.lupeRegular, label: "Sep 29", serviceDate: "2026-09-29", quantity: 1, unit: "VISIT", amountBilledCents: 15000, sourceQuote: "Sep 29 – $150" }),
    ],
    extractionAssumptions: ["Undated lines without 'deep' read as regular visits.", "Year 2026 assumed (message dated Thu, Oct 1)."],
    helperRemarks: ["Thank you!"],
  },
  {
    ...recorded,
    billId: billIds.theo,
    helperId: helperIds.theo,
    sourceDocId: docIds.theoBill,
    statedTotalCents: 58000,
    lineItems: [
      line({ lineId: theoLineIds.walk30, serviceKey: serviceKeys.theoWalk30, label: "30-min walks", quantity: 18, unit: "WALK", unitPriceBilledCents: 2800, amountBilledCents: 50400, sourceQuote: "30-min walks: 18 x $28 = $504" }),
      line({ lineId: theoLineIds.walk60, serviceKey: serviceKeys.theoWalk60, label: "60-min walks", quantity: 2, unit: "WALK", unitPriceBilledCents: 3800, amountBilledCents: 7600, sourceQuote: "60-min walks:  2 x $38 =  $76" }),
    ],
    extractionAssumptions: ["Walks are undated; only counts are given."],
    helperRemarks: ["No walk on Labor Day (9/7)."],
  },
];
