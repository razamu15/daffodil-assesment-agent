/**
 * A term slot is one helper's one service (targetKeys.termSlot). Its occupant is
 * the latest version by effectiveFrom: older versions were closed when it was
 * added. The TERM_SLOT basis pins the occupant a proposal was computed against.
 *
 * Call sites: agreement proposals (basedOn, REPLACE/END preconditions) and the
 * AGREEMENT_CHANGE apply (STALE check).
 */
import { ActionBasisKind } from "@helper-assistant/domain";
import type { ActionBasis, AgreementTerm, Id, ServiceKey } from "@helper-assistant/domain";

export function slotOccupant(terms: readonly AgreementTerm[], helperId: Id, serviceKey: ServiceKey): AgreementTerm | null {
  const slot = terms
    .filter((t) => t.helperId === helperId && t.serviceKey === serviceKey)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));
  return slot.at(-1) ?? null;
}

export function termSlotBasis(helperId: Id, serviceKey: ServiceKey, occupant: AgreementTerm | null): Extract<ActionBasis, { kind: "TERM_SLOT" }> {
  return {
    kind: ActionBasisKind.TERM_SLOT,
    helperId,
    serviceKey,
    currentTermId: occupant?.termId ?? null,
    currentTermVersion: occupant?.version ?? null,
  };
}
