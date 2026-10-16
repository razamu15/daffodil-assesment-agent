/**
 * applyAction: what confirming each action type changes (Doc 3 §4.6). It first
 * re-reads the action's basis; if that moved, the plan is STALE and nothing is
 * written. Otherwise it returns the conditional writes, which confirmAction
 * commits atomically with the CONFIRMED action. No model is involved.
 *
 * Call site: confirmAction (both the confirm route and the UI Approve button).
 */
import {
  ActionBasisKind,
  AgreementChangeKind,
  ActionResolver,
  BillStatus,
  DeliveryMode,
  HelperStatus,
  MessageStatus,
  PendingActionType,
  StoredEntity,
  WriteConditionKind,
} from "@helper-assistant/domain";
import type {
  ActionBasis,
  AgreementTerm,
  Bill,
  Instant,
  PendingAction,
  PendingActionOf,
  StoreRecord,
  TermContent,
  WriteOp,
} from "@helper-assistant/domain";
import { addDays, rangesOverlap } from "../calendar";
import { checkBill, sameCheckContent } from "../checker/checkBill";
import { checkStoredBill } from "../checker/checkStoredBill";
import type { CoreDeps } from "../deps";
import { billedCentsOf } from "../records/billAmounts";
import { earliestVersion, slotOccupant } from "../termVersions";

export const ApplyOutcome = { APPLY: "APPLY", STALE: "STALE" } as const;
export type ApplyPlan = { outcome: typeof ApplyOutcome.APPLY; ops: WriteOp[] } | { outcome: typeof ApplyOutcome.STALE; reason: string };

export type ApplyOptions = { at: Instant; messageBody: string | null };
type Applier<T extends PendingActionType> = (deps: CoreDeps, action: PendingActionOf<T>, options: ApplyOptions) => Promise<ApplyPlan>;

const stale = (reason: string): ApplyPlan => ({ outcome: ApplyOutcome.STALE, reason });

const create = (record: StoreRecord): WriteOp => ({ record, condition: { kind: WriteConditionKind.ABSENT } });
/** `record.value` carries the new version; the condition expects the one before it. */
const update = (record: StoreRecord & { value: { version: number } }): WriteOp => ({
  record,
  condition: { kind: WriteConditionKind.VERSION, expected: record.value.version - 1 },
});

/** The proposer always sets the basis kind for its type; anything else is a bug, not a stale action. */
function basisOf<K extends ActionBasis["kind"]>(action: PendingAction, kind: K): Extract<ActionBasis, { kind: K }> {
  if (action.basedOn.kind !== kind) throw new Error(`Action #${action.ref} (${action.type}) has basis ${action.basedOn.kind}, expected ${kind}`);
  return action.basedOn as Extract<ActionBasis, { kind: K }>;
}

const APPLY_BY_TYPE: { [T in PendingActionType]: Applier<T> } = {
  [PendingActionType.AGREEMENT_CHANGE]: applyAgreementChange,
  [PendingActionType.BILL_APPROVAL]: applyBillApproval,
  [PendingActionType.HELPER_MESSAGE]: applyHelperMessage,
  [PendingActionType.HELPER_ENGAGEMENT_END]: applyEngagementEnd,
};

export function applyAction(deps: CoreDeps, action: PendingAction, options: ApplyOptions): Promise<ApplyPlan> {
  return (APPLY_BY_TYPE[action.type] as Applier<PendingActionType>)(deps, action as never, options);
}

/**
 * Writes the term change, then re-checks the helper's open (RECEIVED) bills
 * against the new terms so their latestCheck, and the Month screen, stay true.
 * A re-checked bill's version moves, so any pending approval of it goes STALE.
 */
async function applyAgreementChange(deps: CoreDeps, action: PendingActionOf<"AGREEMENT_CHANGE">, { at }: ApplyOptions): Promise<ApplyPlan> {
  const basis = basisOf(action, ActionBasisKind.TERM_SLOT);
  const terms = await deps.store.listTerms({ helperId: basis.helperId });
  const occupant = slotOccupant(terms, basis.helperId, basis.serviceKey);
  if ((occupant?.termId ?? null) !== basis.currentTermId || (occupant?.version ?? null) !== basis.currentTermVersion) {
    return stale(`The "${basis.serviceKey}" terms changed after this was proposed. Review the current terms first.`);
  }

  const change = action.payload;
  const newTerm = (content: TermContent, supersedesTermId: string | null): AgreementTerm => ({
    ...content,
    termId: deps.newId(),
    supersedesTermId,
    createdByActionRef: action.ref,
    createdAt: at,
    version: 1,
  });
  // The proposer guaranteed REPLACE/END target the occupant, and the basis check above that it hasn't moved.
  const created: AgreementTerm[] = [];
  /** Existing versions rewritten: closed (effectiveTo set) or re-dated (ADD_EARLIER_TERM). */
  const revised: AgreementTerm[] = [];
  if (change.change === AgreementChangeKind.ADD_TERM) {
    created.push(newTerm(change.term, null));
  } else if (change.change === AgreementChangeKind.REPLACE_TERM) {
    revised.push({ ...occupant!, effectiveTo: addDays(change.term.effectiveFrom, -1), version: occupant!.version + 1 });
    created.push(newTerm(change.term, occupant!.termId));
  } else if (change.change === AgreementChangeKind.ADD_EARLIER_TERM) {
    // The basis pins the slot's latest version; the earliest one is checked here.
    const current = earliestVersion(terms, basis.helperId, basis.serviceKey);
    if (current === null || current.termId !== change.currentTermId) {
      return stale(`The earliest "${basis.serviceKey}" rate changed after this was proposed. Review the current terms first.`);
    }
    revised.push({ ...current, effectiveFrom: addDays(change.term.effectiveTo!, 1), version: current.version + 1 });
    created.push(newTerm(change.term, null));
  } else {
    revised.push({ ...occupant!, effectiveTo: change.effectiveTo, version: occupant!.version + 1 });
  }
  const termOps = [
    ...revised.map((t) => update({ entity: StoredEntity.TERM, value: t })),
    ...created.map((t) => create({ entity: StoredEntity.TERM, value: t })),
  ];

  const revisedIds = new Set(revised.map((t) => t.termId));
  const termsAfter = [...terms.filter((t) => !revisedIds.has(t.termId)), ...revised, ...created];
  const billOps = await recheckOpenBills(deps, basis.helperId, termsAfter, at);
  return { outcome: ApplyOutcome.APPLY, ops: [...termOps, ...billOps] };
}

async function recheckOpenBills(deps: CoreDeps, helperId: string, termsAfter: AgreementTerm[], at: Instant): Promise<WriteOp[]> {
  const [open, approved] = await Promise.all([
    deps.store.listBills({ helperId, status: BillStatus.RECEIVED }),
    deps.store.listBills({ helperId, status: BillStatus.APPROVED }),
  ]);
  const ops: WriteOp[] = [];
  for (const bill of open) {
    const overlapping = approved.find((b) => rangesOverlap(b.period, bill.period));
    const recheckedBill: Bill = { ...bill, version: bill.version + 1 };
    const check = checkBill({ bill: recheckedBill, terms: termsAfter, approvedOverlappingBillId: overlapping?.billId ?? null, checkedAt: at });
    if (bill.latestCheck !== null && sameCheckContent(bill.latestCheck, check)) continue;
    ops.push(update({ entity: StoredEntity.BILL, value: { ...recheckedBill, latestCheck: check } }));
  }
  return ops;
}

/** Re-runs the check; any difference from the snapshot Jordan saw makes it STALE. Then seals the approval. */
async function applyBillApproval(deps: CoreDeps, action: PendingActionOf<"BILL_APPROVAL">, { at }: ApplyOptions): Promise<ApplyPlan> {
  const basis = basisOf(action, ActionBasisKind.BILL_VERSION);
  const bill = await deps.store.getBill(basis.billId);
  if (bill === null || bill.status !== BillStatus.RECEIVED || bill.version !== basis.version) {
    return stale(`The bill changed after this was proposed (it is now ${bill?.status ?? "missing"}, version ${bill?.version ?? "none"}).`);
  }
  const check = await checkStoredBill(deps, bill);
  if (!sameCheckContent(check, action.payload.checkSnapshot)) return stale("The bill's check result changed after this was proposed. Review it again.");

  const approved: Bill = {
    ...bill,
    status: BillStatus.APPROVED,
    latestCheck: check,
    approval: {
      approvedAt: at,
      approvedBy: ActionResolver.USER_UI,
      viaActionRef: action.ref,
      billedCents: billedCentsOf(bill),
      amountApprovedCents: action.payload.amountApprovedCents,
      acceptedExceptions: action.payload.acceptedExceptions,
      checkSnapshot: action.payload.checkSnapshot,
      termVersions: check.termVersions,
    },
    version: bill.version + 1,
  };
  return { outcome: ApplyOutcome.APPLY, ops: [update({ entity: StoredEntity.BILL, value: approved })] };
}

/** Creates the READY draft for Jordan to copy or open in Messages. Never sends. */
async function applyHelperMessage(deps: CoreDeps, action: PendingActionOf<"HELPER_MESSAGE">, { at, messageBody }: ApplyOptions): Promise<ApplyPlan> {
  const p = action.payload;
  return {
    outcome: ApplyOutcome.APPLY,
    ops: [
      create({
        entity: StoredEntity.MESSAGE,
        value: {
          messageId: deps.newId(),
          helperId: p.helperId,
          reason: p.reason,
          relatedBillId: p.relatedBillId,
          relatedPeriod: p.relatedPeriod,
          body: messageBody ?? p.body,
          deliveryMode: DeliveryMode.MANUAL_HANDOFF,
          status: MessageStatus.READY,
          channelHint: p.channelHint,
          createdByActionRef: action.ref,
          createdAt: at,
          handedOffAt: null,
          version: 1,
        },
      }),
    ],
  };
}

async function applyEngagementEnd(deps: CoreDeps, action: PendingActionOf<"HELPER_ENGAGEMENT_END">): Promise<ApplyPlan> {
  const basis = basisOf(action, ActionBasisKind.HELPER_VERSION);
  const helper = await deps.store.getHelper(basis.helperId);
  if (helper === null || helper.version !== basis.version || helper.status !== HelperStatus.ACTIVE) {
    return stale("The helper's record changed after this was proposed. Review it again.");
  }
  const ended = { ...helper, status: HelperStatus.ENDED, endedOn: action.payload.endedOn, version: helper.version + 1 };
  return { outcome: ApplyOutcome.APPLY, ops: [update({ entity: StoredEntity.HELPER, value: ended })] };
}
