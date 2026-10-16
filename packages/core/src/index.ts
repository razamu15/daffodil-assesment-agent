/**
 * @helper-assistant/core: the deterministic rules (pure code, no model, no AWS).
 *
 * Checker (Doc 3 §3), month status, the PendingAction pipeline with applyAction
 * (Doc 3 §4.6), and the record functions behind the RECORD tools and the api's
 * direct-save routes. Each export's docstring names its call sites.
 */
export * from "./errors";
export type { CoreDeps } from "./deps";
export { formatCents } from "./money";
export { previousMonth } from "./calendar";

export { checkBill, sameCheckContent } from "./checker/checkBill";
export type { CheckBillInput } from "./checker/checkBill";
export { checkBillById, checkStoredBill } from "./checker/checkStoredBill";
export { isInEffectOn } from "./checker/terms";
export { blockingItems, unacceptedBlockingItems, verdictOf } from "./checker/severity";
export { PRICING_MODE_BY_RULE_KIND, PricingMode } from "./checker/lineChecks";

export { deriveMonthStatus, getMonthStatus } from "./monthStatus";
export type { MonthStatusInput } from "./monthStatus";

export { proposeAction } from "./actions/pipeline";
export type { ActionDraft, ActionSource } from "./actions/pipeline";
export {
  MESSAGE_SUBJECT_NONE,
  proposeAgreementChange,
  proposeBillApproval,
  proposeEngagementEnd,
  proposeHelperMessage,
} from "./actions/proposals";
export { applyAction, ApplyOutcome } from "./actions/apply";
export type { ApplyOptions, ApplyPlan } from "./actions/apply";
export { confirmAction, rejectAction, withdrawAction } from "./actions/resolve";
export type { ConfirmInput } from "./actions/resolve";
export { earliestVersion, slotOccupant } from "./termVersions";
export { helperServices, ServiceStatus } from "./helperServices";
export type { HelperService } from "./helperServices";
export { describeRule, describeRules } from "./actions/describe";

export { billedCentsOf, sumOfLinesCentsOf } from "./records/billAmounts";
export { approveBill, paymentIdFor, recordBill, recordPayment } from "./records/bills";
export type { ApproveBillInput, RecordBillResult } from "./records/bills";
export { createHelper, updateHelperProfile } from "./records/helpers";
export { markMessageHandedOff } from "./records/messages";
export { saveDocument } from "./records/documents";
export { failTurnDispatch, startTurn } from "./records/sessions";

