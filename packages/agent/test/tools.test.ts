/**
 * Tools layer (build-plan §6.1 "Tools"): the registry surface, the validation
 * boundary, error mapping, and each tool over the starter pack via core.
 */
import { approveBill } from "@helper-assistant/core";
import {
  AgreementChangeKind,
  BillPeriodKind,
  BillStatus,
  BillVerdict,
  ContactChannel,
  ExceptionTarget,
  HouseKeyAccess,
  LineKind,
  NoteKind,
  PaymentMethod,
  PendingActionStatus,
  PricingRuleKind,
  ProposeOutcome,
  ScheduleKind,
  ToolErrorCode,
  toolInputSchemas,
} from "@helper-assistant/domain";
import type { ToolInput, ToolResult } from "@helper-assistant/domain";
import {
  billIds,
  docIds,
  expectedBillChecks,
  expectedSeptemberMonthStatus,
  helperIds,
  lupeLineIds,
  priyaLineIds,
  SEPTEMBER_2026,
  serviceKeys,
  termIds,
} from "@helper-assistant/fixtures";
import { describe, expect, it } from "vitest";
import { dispatchTool, toolSpecs } from "../src/index";
import { starterPackAgent, toolContext } from "./harness";

const FORBIDDEN_TOOLS = ["confirm_action", "approve_bill", "send_message", "edit_approved_bill", "delete_anything", "run_code"];

const ok = <T>(result: ToolResult<unknown>): T => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.data as T;
};
const errorCode = (result: ToolResult<unknown>) => (result.ok ? null : result.error.code);

async function setup() {
  const deps = await starterPackAgent([]);
  const ctx = toolContext(deps);
  return { deps, ctx, call: (name: string, input: unknown) => dispatchTool(name, input, ctx) };
}

const lupeVisit = (date: string, serviceKey: string, cents: number): ToolInput<"record_bill">["lineItems"][number] => ({
  lineKind: LineKind.SERVICE,
  serviceKey,
  label: serviceKey,
  serviceDate: date,
  startAt: null,
  endAt: null,
  quantity: 1,
  unit: "VISIT",
  unitPriceBilledCents: null,
  amountBilledCents: cents,
  authorizationClaim: null,
  sourceQuote: `${date} $${cents / 100}`,
  relatedLineIndex: null,
});

const correctedLupeBill: ToolInput<"record_bill"> = {
  docId: docIds.lupeBill,
  helperId: helperIds.lupe,
  period: SEPTEMBER_2026,
  lineItems: [
    lupeVisit("2026-09-01", serviceKeys.lupeRegular, 14000),
    lupeVisit("2026-09-08", serviceKeys.lupeRegular, 14000),
    lupeVisit("2026-09-15", serviceKeys.lupeRegular, 15000),
    lupeVisit("2026-09-22", serviceKeys.lupeDeep, 22000),
    lupeVisit("2026-09-29", serviceKeys.lupeRegular, 15000),
  ],
  statedTotalCents: 80000,
  extractionAssumptions: [],
  helperRemarks: [],
};

describe("the tool surface", () => {
  it("is exactly the domain tools, each with a description and an object schema", () => {
    expect(toolSpecs.map((t) => t.name).sort()).toEqual(Object.keys(toolInputSchemas).sort());
    for (const spec of toolSpecs) {
      expect(spec.description.length).toBeGreaterThan(20);
      expect(spec.inputSchema.type).toBe("object");
      expect(spec.inputSchema).not.toHaveProperty("$schema");
    }
  });

  it("has no confirm, approve, send, edit or delete tool", () => {
    for (const name of FORBIDDEN_TOOLS) expect(toolSpecs.map((t) => t.name)).not.toContain(name);
  });

  it("refuses a tool it doesn't have, and changes nothing", async () => {
    const { call, deps } = await setup();
    const result = await call("confirm_action", { ref: 1 });
    expect(errorCode(result)).toBe(ToolErrorCode.INVALID_INPUT);
    expect(await deps.store.listActions({ status: PendingActionStatus.CONFIRMED })).toEqual([]);
  });

  it("validates input once, at the boundary", async () => {
    const { call } = await setup();
    expect(errorCode(await call("get_bill", {}))).toBe(ToolErrorCode.INVALID_INPUT);
    expect(errorCode(await call("get_month_status", { month: "September" }))).toBe(ToolErrorCode.INVALID_INPUT);
    expect(errorCode(await call("get_bill", { billId: "nope" }))).toBe(ToolErrorCode.NOT_FOUND);
  });
});

describe("read tools", () => {
  it("list_helpers carries each helper's service keys", async () => {
    const { call } = await setup();
    const { helpers } = ok<{ helpers: { helperId: string; services: { serviceKey: string }[] }[] }>(await call("list_helpers", {}));
    const lupe = helpers.find((h) => h.helperId === helperIds.lupe)!;
    expect(lupe.services.map((s) => s.serviceKey).sort()).toEqual([serviceKeys.lupeDeep, serviceKeys.lupeRegular]);
  });

  it("list_agreements returns the term in effect on a date, or every version, with source precedence", async () => {
    const { call } = await setup();
    type Terms = { terms: { termId: string; source: { precedenceRank: number } | null }[] };
    const onSep1 = ok<Terms>(await call("list_agreements", { helperId: helperIds.lupe, asOf: "2026-09-01" }));
    expect(onSep1.terms.map((t) => t.termId).sort()).toEqual([termIds.lupeDeep, termIds.lupeRegular140].sort());
    const all = ok<Terms>(await call("list_agreements", { helperId: helperIds.lupe, asOf: null }));
    expect(all.terms.map((t) => t.termId)).toContain(termIds.lupeRegular150);
    expect(all.terms.every((t) => t.source !== null && t.source.precedenceRank >= 1)).toBe(true);
    expect(errorCode(await call("list_agreements", { helperId: "helper-nobody", asOf: null }))).toBe(ToolErrorCode.NOT_FOUND);
  });

  it("check_bill is core's checker (the answer key)", async () => {
    const { call } = await setup();
    for (const expected of expectedBillChecks) {
      const { check } = ok<{ check: { verdict: string; sumOfLinesCents: number } }>(await call("check_bill", { billId: expected.billId }));
      expect(check.verdict).toBe(expected.verdict);
      expect(check.sumOfLinesCents).toBe(expected.sumOfLinesCents);
    }
  });

  it("get_month_status with no month means the most recent closed month", async () => {
    const { call } = await setup();
    const status = ok<{ month: string; rows: { helperId: string; state: string }[] }>(await call("get_month_status", { month: null }));
    expect(status.month).toBe("2026-09");
    for (const row of expectedSeptemberMonthStatus) expect(status.rows.find((r) => r.helperId === row.helperId)?.state).toBe(row.state);
  });

  it("list_bills filters and summarizes", async () => {
    const { call } = await setup();
    const { bills } = ok<{ bills: { billId: string; verdict: string }[] }>(await call("list_bills", { month: "2026-09", helperId: helperIds.theo, status: null }));
    expect(bills).toEqual([expect.objectContaining({ billId: billIds.theo, verdict: BillVerdict.CHECKS_OUT })]);
  });
});

describe("record tools", () => {
  it("save_helper creates and updates directly (not gated)", async () => {
    const { call, deps } = await setup();
    const profile = {
      name: "Marco",
      role: "tutor",
      houseKeyAccess: HouseKeyAccess.UNKNOWN,
      payment: { method: PaymentMethod.UNKNOWN, handle: null },
      contact: { channel: ContactChannel.UNKNOWN, handle: null },
      startedOn: null,
      notes: "",
    };
    const created = ok<{ created: boolean; helper: { helperId: string } }>(await call("save_helper", { helperId: null, profile }));
    expect(created.created).toBe(true);
    const updated = ok<{ helper: { version: number; notes: string } }>(
      await call("save_helper", { helperId: created.helper.helperId, profile: { ...profile, notes: "Math, Thursdays" } }),
    );
    expect(updated.helper).toMatchObject({ version: 2, notes: "Math, Thursdays" });
    expect(await deps.store.listActions()).toEqual([]);
  });

  it("record_bill saves a corrected bill checked, superseding the unapproved one", async () => {
    const { call, deps } = await setup();
    const result = ok<{ bill: { billId: string }; check: { verdict: string }; supersededBillId: string }>(await call("record_bill", correctedLupeBill));
    expect(result.check.verdict).toBe(BillVerdict.CHECKS_OUT);
    expect(result.supersededBillId).toBe(billIds.lupe);
    expect((await deps.store.getBill(billIds.lupe))?.status).toBe(BillStatus.SUPERSEDED);
    expect((await deps.store.getBill(result.bill.billId))?.latestCheck?.verdict).toBe(BillVerdict.CHECKS_OUT);
  });

  it("record_bill refuses a corrected bill for an already-approved period (Product S1) and saves nothing", async () => {
    const { call, deps } = await setup();
    // Jordan approved Lupe's bill in the UI, accepting both overcharged visits.
    await approveBill(deps, {
      billId: billIds.lupe,
      billVersion: 1,
      acceptedExceptions: [lupeLineIds.sep1, lupeLineIds.sep8].map((lineId) => ({ target: ExceptionTarget.LINE, lineId, reason: "Agreed with Lupe" })),
    });
    const before = await deps.store.listBills({ helperId: helperIds.lupe });
    const result = await call("record_bill", correctedLupeBill);
    expect(errorCode(result)).toBe(ToolErrorCode.PERIOD_ALREADY_APPROVED);
    expect(await deps.store.listBills({ helperId: helperIds.lupe })).toEqual(before);
  });

  it("record_bill needs an existing source document", async () => {
    const { call } = await setup();
    expect(errorCode(await call("record_bill", { ...correctedLupeBill, docId: "doc-missing" }))).toBe(ToolErrorCode.NOT_FOUND);
  });
});

describe("propose tools", () => {
  it("propose_bill_approval needs every flag accepted with a reason, and approves the sum of the lines", async () => {
    const { call, ctx, deps } = await setup();
    expect(errorCode(await call("propose_bill_approval", { billId: billIds.priya, acceptedExceptions: [] }))).toBe(ToolErrorCode.NOT_ALLOWED);

    const reason = "Talked to Priya: the same-day fee was OK'd and the total was a typo";
    const result = ok<{ outcome: string; action: { ref: number; status: string; payload: { amountApprovedCents: number } } }>(
      await call("propose_bill_approval", {
        billId: billIds.priya,
        acceptedExceptions: [
          { target: ExceptionTarget.LINE, lineId: priyaLineIds.fee, reason },
          { target: ExceptionTarget.FINDING, findingKind: "TOTAL_MISMATCH", reason },
        ],
      }),
    );
    expect(result.outcome).toBe(ProposeOutcome.PROPOSED);
    expect(result.action.status).toBe(PendingActionStatus.PENDING);
    expect(result.action.payload.amountApprovedCents).toBe(59600);
    expect(ctx.trace.proposedActionRefs).toEqual([result.action.ref]);
    expect((await deps.store.getBill(billIds.priya))?.status).toBe(BillStatus.RECEIVED);
  });

  it("propose_agreement_change can't cite a bill as its source", async () => {
    const { call, ctx } = await setup();
    const term = {
      helperId: helperIds.priya,
      serviceKey: "same-day-fee",
      serviceLabel: "Same-day fee",
      pricingRules: [{ kind: PricingRuleKind.FEE, label: "last minute fee", amountCents: 4000, condition: "same-day booking" }],
      schedule: { kind: ScheduleKind.AD_HOC },
      effectiveFrom: "2026-10-14",
      effectiveTo: null,
      sourceQuote: "+ last minute fee $40",
      assumptions: [],
    };
    const fromBill = await call("propose_agreement_change", { change: { change: AgreementChangeKind.ADD_TERM, term: { ...term, sourceDocId: docIds.priyaBill } }, sourceDocId: null });
    expect(errorCode(fromBill)).toBe(ToolErrorCode.NOT_ALLOWED);
    const fromNowhere = await call("propose_agreement_change", { change: { change: AgreementChangeKind.ADD_TERM, term: { ...term, sourceDocId: "doc-missing" } }, sourceDocId: null });
    expect(errorCode(fromNowhere)).toBe(ToolErrorCode.NOT_FOUND);
    expect(ctx.trace.proposedActionRefs).toEqual([]);
  });

  it("two proposals for the same slot come back NEEDS_DECISION with the conflict", async () => {
    const { call } = await setup();
    const replace = (cents: number) => ({
      change: {
        change: AgreementChangeKind.REPLACE_TERM,
        supersedesTermId: termIds.lupeRegular150,
        term: {
          helperId: helperIds.lupe,
          serviceKey: serviceKeys.lupeRegular,
          serviceLabel: "Regular cleaning",
          pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "VISIT", amountCents: cents }],
          schedule: { kind: ScheduleKind.WEEKLY_ON, days: ["TUE"] },
          effectiveFrom: "2027-01-01",
          effectiveTo: null,
          sourceDocId: docIds.householdNotes,
          sourceQuote: "test",
          assumptions: [],
        },
      },
    });
    expect(ok<{ outcome: string }>(await call("propose_agreement_change", replace(16000))).outcome).toBe(ProposeOutcome.PROPOSED);
    const second = ok<{ outcome: string; conflicts: unknown[] }>(await call("propose_agreement_change", replace(17000)));
    expect(second.outcome).toBe(ProposeOutcome.NEEDS_DECISION);
    expect(second.conflicts).toHaveLength(1);
  });

  it("propose_engagement_end reminds that Lupe has a key; withdraw only withdraws", async () => {
    const { call, deps } = await setup();
    const result = ok<{ action: { ref: number }; reminders: string[] }>(await call("propose_engagement_end", { helperId: helperIds.lupe, endedOn: "2026-10-14" }));
    expect(result.reminders.join(" ")).toMatch(/key/);
    const withdrawn = ok<{ action: { status: string } }>(await call("withdraw_pending_action", { ref: result.action.ref, reason: "Jordan changed their mind" }));
    expect(withdrawn.action.status).toBe(PendingActionStatus.WITHDRAWN);
    expect((await deps.store.getHelper(helperIds.lupe))?.status).toBe("ACTIVE");
  });

  it("propose_helper_message drafts only", async () => {
    const { call, deps } = await setup();
    const result = ok<{ action: { type: string } }>(
      await call("propose_helper_message", {
        helperId: helperIds.lupe,
        reason: "DISCREPANCY",
        body: "Hi Lupe, Sep 1 and 8 show $150 but the new rate started Sep 15. Could you send a corrected total of $800?",
        relatedBillId: billIds.lupe,
        relatedPeriod: { ...SEPTEMBER_2026, kind: BillPeriodKind.CALENDAR_MONTH },
      }),
    );
    expect(result.action.type).toBe("HELPER_MESSAGE");
    expect(await deps.store.listMessages()).toEqual([]);
  });
});

describe("escape tools", () => {
  it("save_unstructured_note and flag_for_review persist open notes", async () => {
    const { call, deps } = await setup();
    ok(await call("save_unstructured_note", { helperId: helperIds.priya, text: "$10 extra for the second child", sourceDocId: docIds.householdNotes }));
    ok(await call("flag_for_review", { reason: "Lupe's bill image is blurry", helperId: helperIds.lupe, billId: billIds.lupe }));
    const notes = await deps.store.listNotes();
    expect(notes.map((n) => n.noteKind).sort()).toEqual([NoteKind.REVIEW_FLAG, NoteKind.UNENCODED_TERM]);
    expect(errorCode(await call("flag_for_review", { reason: "x", helperId: null, billId: "bill-missing" }))).toBe(ToolErrorCode.NOT_FOUND);
  });
});
