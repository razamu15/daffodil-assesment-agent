/**
 * Identity keys for PendingAction.targetKey. Two PENDING actions with the same
 * key conflict (Doc 3 §4.6 "Detect").
 *
 * Call sites: core's propose pipeline (computing targetKey and TERM_SLOT bases),
 * agent tools (looking up conflicts), the UI (grouping conflicting cards).
 */
import type { Id, ServiceKey } from "./primitives";

export const targetKeys = {
  /** Engagement end changes the helper record. */
  helper: (helperId: Id) => `HELPER#${helperId}`,
  /** All versions of one service's term share a slot. */
  termSlot: (helperId: Id, serviceKey: ServiceKey) => `TERM#${helperId}#${serviceKey}`,
  bill: (billId: Id) => `BILL#${billId}`,
  /** One draft per helper, reason and subject (a bill, or a period start for MISSING_BILL). */
  message: (helperId: Id, reason: string, subject: string) => `MSG#${helperId}#${reason}#${subject}`,
};
