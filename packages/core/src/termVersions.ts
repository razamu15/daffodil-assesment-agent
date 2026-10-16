/**
 * The versions of one helper's one service (a term slot), and which one is
 * earliest or current. Versions are ordered by effectiveFrom, then createdAt.
 *
 * Call sites: actions/termSlot.ts (slot occupant for proposals and STALE checks),
 * actions/proposals.ts and apply.ts (ADD_EARLIER_TERM), checker/terms.ts (the
 * earliest version covers the past).
 */
import type { AgreementTerm, Id, ServiceKey } from "@helper-assistant/domain";

function slotVersions(terms: readonly AgreementTerm[], helperId: Id, serviceKey: ServiceKey): AgreementTerm[] {
  return terms
    .filter((t) => t.helperId === helperId && t.serviceKey === serviceKey)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));
}

/** The latest version: older ones were closed when it was added. */
export function slotOccupant(terms: readonly AgreementTerm[], helperId: Id, serviceKey: ServiceKey): AgreementTerm | null {
  return slotVersions(terms, helperId, serviceKey).at(-1) ?? null;
}

/** The earliest saved version: it also covers dates before its effectiveFrom (checker/terms.ts). */
export function earliestVersion(terms: readonly AgreementTerm[], helperId: Id, serviceKey: ServiceKey): AgreementTerm | null {
  return slotVersions(terms, helperId, serviceKey)[0] ?? null;
}
