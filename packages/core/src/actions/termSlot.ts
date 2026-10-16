/**
 * A term slot is one helper's one service (targetKeys.termSlot). The TERM_SLOT
 * basis pins the slot's occupant (termVersions.slotOccupant) a proposal was
 * computed against.
 *
 * Call sites: agreement proposals (basedOn, REPLACE/END/ADD_EARLIER preconditions)
 * and the AGREEMENT_CHANGE apply (STALE check).
 */
import { ActionBasisKind } from "@helper-assistant/domain";
import type { ActionBasis, AgreementTerm, Id, ServiceKey } from "@helper-assistant/domain";

export function termSlotBasis(helperId: Id, serviceKey: ServiceKey, occupant: AgreementTerm | null): Extract<ActionBasis, { kind: "TERM_SLOT" }> {
  return {
    kind: ActionBasisKind.TERM_SLOT,
    helperId,
    serviceKey,
    currentTermId: occupant?.termId ?? null,
    currentTermVersion: occupant?.version ?? null,
  };
}
