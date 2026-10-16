/**
 * Type-specific proposers: each checks the domain preconditions only stored state
 * can answer, builds the payload, targetKey, basedOn and card summary, and hands
 * the draft to proposeAction. Inputs are the agent tool shapes (domain
 * toolInputSchemas), already validated by the caller.
 *
 * Call sites: the agent's propose_* tools; approveBill (the UI Approve button
 * proposes a BILL_APPROVAL and confirms it in one request).
 */
import {
  ActionBasisKind,
  AgreementChangeKind,
  BillPeriodKind,
  BillStatus,
  ExceptionTarget,
  HelperStatus,
  HouseKeyAccess,
  PendingActionType,
  targetKeys,
} from "@helper-assistant/domain";
import type { AgreementTerm, Helper, HouseKeyAccess as HouseKeyAccessT, ProposeResult, ToolInput } from "@helper-assistant/domain";
import { addDays, firstDayOfMonth, monthOf, rangesOverlap } from "../calendar";
import { checkStoredBill } from "../checker/checkStoredBill";
import { unacceptedBlockingItems } from "../checker/severity";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";
import { formatCents } from "../money";
import { sumOfLinesCentsOf } from "../records/billAmounts";
import { describeRules } from "./describe";
import { proposeAction } from "./pipeline";
import type { ActionDraft, ActionSource } from "./pipeline";
import { earliestVersion, slotOccupant } from "../termVersions";
import { termSlotBasis } from "./termSlot";

type Deps = Pick<CoreDeps, "store" | "clock">;

/** Far-future stand-in for an open-ended term's end, only for overlap comparison. */
const OPEN_ENDED = "9999-12-31";

/** Subject of a message's targetKey when it concerns no bill or period. */
export const MESSAGE_SUBJECT_NONE = "NONE";

/** Reminder on the engagement-end card, by key access. null = nothing to remind. */
const KEY_REMINDER: Record<HouseKeyAccessT, ((name: string) => string) | null> = {
  [HouseKeyAccess.HAS_KEY]: (name) => `${name} has a key to the house.`,
  [HouseKeyAccess.UNKNOWN]: (name) => `It isn't recorded whether ${name} has a key.`,
  [HouseKeyAccess.NO_KEY]: null,
};

const notAllowed = (message: string) => new CoreError(CoreErrorCode.NOT_ALLOWED, message);

async function requireHelper({ store }: Deps, helperId: string): Promise<Helper> {
  const helper = await store.getHelper(helperId);
  if (helper === null) throw notFound("Helper", helperId);
  return helper;
}

/** propose_agreement_change. targetKey = the term slot; basedOn = its current occupant. */
export async function proposeAgreementChange(
  deps: Deps,
  { change, sourceDocId }: ToolInput<"propose_agreement_change">,
  source: Omit<ActionSource, "docId">,
): Promise<ProposeResult> {
  const subject = await changedSlot(deps, change);
  const helper = await requireHelper(deps, subject.helperId);
  const terms = await deps.store.listTerms({ helperId: helper.helperId });
  const occupant = slotOccupant(terms, helper.helperId, subject.serviceKey);

  let summary: string;
  if (change.change === AgreementChangeKind.ADD_TERM) {
    const clash = terms.find(
      (t) =>
        t.serviceKey === change.term.serviceKey &&
        rangesOverlap(
          { start: t.effectiveFrom, end: t.effectiveTo ?? OPEN_ENDED },
          { start: change.term.effectiveFrom, end: change.term.effectiveTo ?? OPEN_ENDED },
        ),
    );
    if (clash) throw notAllowed(`${helper.name} already has "${change.term.serviceKey}" terms for those dates (${clash.termId}). Propose a REPLACE_TERM instead.`);
    summary = `${helper.name}: add ${change.term.serviceLabel} at ${describeRules(change.term)} from ${change.term.effectiveFrom}`;
  } else if (change.change === AgreementChangeKind.REPLACE_TERM) {
    const replaced = assertOccupant(occupant, change.supersedesTermId);
    if (replaced.helperId !== change.term.helperId || replaced.serviceKey !== change.term.serviceKey) {
      throw notAllowed("A replacement term must be for the same helper and service as the term it replaces.");
    }
    if (change.term.effectiveFrom <= replaced.effectiveFrom) {
      throw notAllowed(`The replacement must start after the current term (from ${replaced.effectiveFrom}).`);
    }
    summary = `${helper.name}: ${replaced.serviceLabel} ${describeRules(replaced)} → ${describeRules(change.term)} from ${change.term.effectiveFrom}`;
  } else if (change.change === AgreementChangeKind.ADD_EARLIER_TERM) {
    const current = assertEarliest(terms, change.currentTermId, helper.helperId, change.term.serviceKey);
    const earlierEnd = change.term.effectiveTo;
    if (earlierEnd === null) throw notAllowed("An earlier rate must say when it ended (effectiveTo): the current rate starts the day after.");
    if (change.term.effectiveFrom > earlierEnd) throw notAllowed(`The earlier rate can't end (${earlierEnd}) before it starts (${change.term.effectiveFrom}).`);
    const currentStartsOn = addDays(earlierEnd, 1);
    if (currentStartsOn > current.effectiveFrom) {
      throw notAllowed(`The earlier rate must end before the current one starts (${current.effectiveFrom}); it ends ${earlierEnd}.`);
    }
    summary = `${helper.name}: ${current.serviceLabel} was ${describeRules(change.term)} until ${earlierEnd}; ${describeRules(current)} from ${currentStartsOn}`;
  } else {
    const ended = assertOccupant(occupant, change.termId);
    if (change.effectiveTo < ended.effectiveFrom) throw notAllowed(`The term can't end before it starts (${ended.effectiveFrom}).`);
    summary = `${helper.name}: end ${ended.serviceLabel} after ${change.effectiveTo}`;
  }

  const draft: ActionDraft = {
    type: PendingActionType.AGREEMENT_CHANGE,
    payload: change,
    targetKey: targetKeys.termSlot(helper.helperId, subject.serviceKey),
    basedOn: termSlotBasis(helper.helperId, subject.serviceKey, occupant),
    summary,
    assumptions: change.change === AgreementChangeKind.END_TERM ? [] : change.term.assumptions,
  };
  // An END_TERM's source is whatever said so, not the document the term came from.
  const termDocId = change.change === AgreementChangeKind.END_TERM ? null : change.term.sourceDocId;
  return proposeAction(deps, draft, { ...source, docId: sourceDocId ?? termDocId });
}

function assertEarliest(terms: readonly AgreementTerm[], termId: string, helperId: string, serviceKey: string): AgreementTerm {
  const earliest = earliestVersion(terms, helperId, serviceKey);
  if (earliest === null || earliest.termId !== termId) {
    throw notAllowed(`Term ${termId} isn't the earliest saved version of "${serviceKey}"${earliest ? ` (that's ${earliest.termId})` : ""}.`);
  }
  return earliest;
}

/** The helper and service an agreement change is about. */
async function changedSlot({ store }: Deps, change: ToolInput<"propose_agreement_change">["change"]): Promise<{ helperId: string; serviceKey: string }> {
  if (change.change !== AgreementChangeKind.END_TERM) return change.term;
  const term = await store.getTerm(change.termId);
  if (term === null) throw notFound("Term", change.termId);
  return term;
}

function assertOccupant(occupant: AgreementTerm | null, termId: string): AgreementTerm {
  if (occupant === null || occupant.termId !== termId) {
    throw notAllowed(`Term ${termId} isn't the current version of its service${occupant ? ` (that's ${occupant.termId})` : ""}.`);
  }
  return occupant;
}

/**
 * propose_bill_approval. Snapshots a fresh check; every DISCREPANCY / NEEDS_INFO
 * item must be accepted as an exception with Jordan's reason, or there is nothing
 * to propose. The approved amount is the sum of the lines (sumOfLinesCentsOf), never the stated total.
 */
export async function proposeBillApproval(
  deps: Deps,
  { billId, acceptedExceptions }: ToolInput<"propose_bill_approval">,
  source: ActionSource,
): Promise<ProposeResult> {
  const bill = await deps.store.getBill(billId);
  if (bill === null) throw notFound("Bill", billId);
  if (bill.status !== BillStatus.RECEIVED) throw new CoreError(CoreErrorCode.BILL_NOT_APPROVABLE, `Bill ${billId} is ${bill.status}.`);
  const helper = await requireHelper(deps, bill.helperId);
  const check = await checkStoredBill(deps, bill);

  const lineIds = new Set(bill.lineItems.map((l) => l.lineId));
  const findingKinds = new Set(check.findings.map((f) => f.kind));
  for (const exception of acceptedExceptions) {
    const known = exception.target === ExceptionTarget.LINE ? lineIds.has(exception.lineId) : findingKinds.has(exception.findingKind);
    if (!known) throw notAllowed(`Accepted exception ${JSON.stringify(exception)} doesn't match anything on this bill's check.`);
  }
  const unaccepted = unacceptedBlockingItems(check, acceptedExceptions);
  if (unaccepted.length > 0) throw notAllowed(`These need an accepted exception (with Jordan's reason) before approval: ${unaccepted.join("; ")}.`);

  const amount = sumOfLinesCentsOf(bill);
  const exceptionsText = acceptedExceptions.length === 0 ? "" : `, with ${acceptedExceptions.length} accepted exception(s)`;
  const draft: ActionDraft = {
    type: PendingActionType.BILL_APPROVAL,
    payload: { billId, acceptedExceptions, amountApprovedCents: amount, checkSnapshot: check },
    targetKey: targetKeys.bill(billId),
    basedOn: { kind: ActionBasisKind.BILL_VERSION, billId, version: bill.version },
    summary: `Approve ${helper.name}'s bill for ${bill.period.start} to ${bill.period.end}: ${formatCents(amount)}${exceptionsText}`,
    assumptions: [],
  };
  return proposeAction(deps, draft, source);
}

/** propose_helper_message. One draft per helper, reason and subject; nothing can go stale. */
export async function proposeHelperMessage(deps: Deps, input: ToolInput<"propose_helper_message">, source: ActionSource): Promise<ProposeResult> {
  const helper = await requireHelper(deps, input.helperId);
  if (input.relatedBillId !== null) {
    const bill = await deps.store.getBill(input.relatedBillId);
    if (bill === null) throw notFound("Bill", input.relatedBillId);
    if (bill.helperId !== helper.helperId) throw notAllowed(`Bill ${bill.billId} isn't ${helper.name}'s.`);
  }
  const subject = input.relatedBillId ?? input.relatedPeriod?.start ?? MESSAGE_SUBJECT_NONE;
  const draft: ActionDraft = {
    type: PendingActionType.HELPER_MESSAGE,
    payload: { ...input, channelHint: helper.contact.channel },
    targetKey: targetKeys.message(helper.helperId, input.reason, subject),
    basedOn: { kind: ActionBasisKind.NONE },
    summary: `Message to ${helper.name} (${input.reason}): "${input.body.length > 80 ? `${input.body.slice(0, 77)}...` : input.body}"`,
    assumptions: [],
  };
  return proposeAction(deps, draft, source);
}

/** propose_engagement_end. A final bill is then expected for the start of that month to endedOn. */
export async function proposeEngagementEnd(deps: Deps, { helperId, endedOn }: ToolInput<"propose_engagement_end">, source: ActionSource): Promise<ProposeResult> {
  const helper = await requireHelper(deps, helperId);
  if (helper.status !== HelperStatus.ACTIVE) throw notAllowed(`${helper.name}'s engagement already ended (${helper.endedOn}).`);
  if (helper.startedOn !== null && endedOn < helper.startedOn) throw notAllowed(`${helper.name} started on ${helper.startedOn}, after ${endedOn}.`);
  const finalPeriod = { start: firstDayOfMonth(monthOf(endedOn)), end: endedOn, kind: BillPeriodKind.FINAL_SETTLEMENT };
  const reminder = KEY_REMINDER[helper.houseKeyAccess];
  const draft: ActionDraft = {
    type: PendingActionType.HELPER_ENGAGEMENT_END,
    payload: { helperId, endedOn, finalPeriod, houseKeyAccess: helper.houseKeyAccess },
    targetKey: targetKeys.helper(helperId),
    basedOn: { kind: ActionBasisKind.HELPER_VERSION, helperId, version: helper.version },
    summary: `End ${helper.name}'s engagement on ${endedOn}; final bill expected for ${finalPeriod.start} to ${finalPeriod.end}`,
    assumptions: [],
  };
  return proposeAction(deps, draft, source, reminder === null ? [] : [reminder(helper.name)]);
}
