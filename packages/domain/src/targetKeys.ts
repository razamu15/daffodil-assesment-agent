/**
 * Identity keys for PendingAction.targetKey. Two PENDING actions with the same
 * key conflict (Doc 3 §4.6 "Detect").
 *
 * Call sites: core's propose pipeline (computing targetKey and TERM_SLOT bases),
 * agent tools (looking up conflicts), the UI (grouping conflicting cards).
 */
import { ServiceKind } from "./enums";
import type { Id } from "./primitives";

/**
 * The slot a term occupies for a helper. Known service kinds are their own slot;
 * OTHER is identified by its label, so a tutor's "Tutoring" and "Test prep" are
 * separate slots.
 */
export function termSlot(serviceKind: ServiceKind, serviceLabel: string): string {
  return serviceKind === ServiceKind.OTHER ? `OTHER:${serviceLabel.trim().toLowerCase()}` : serviceKind;
}

export const targetKeys = {
  /** Profile changes and engagement end both change the helper record. */
  helper: (helperId: Id) => `HELPER#${helperId}`,
  termSlot: (helperId: Id, slot: string) => `TERM#${helperId}#${slot}`,
  bill: (billId: Id) => `BILL#${billId}`,
  /** One draft per helper, reason and subject (a bill, or a period start for MISSING_BILL). */
  message: (helperId: Id, reason: string, subject: string) => `MSG#${helperId}#${reason}#${subject}`,
};
