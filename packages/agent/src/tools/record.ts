/**
 * RECORD tools: facts that need no confirmation (Doc 3 §8 A4, §10 C5, C17).
 * A helper's profile is saved directly; a bill is the helper's claim, saved
 * RECEIVED and checked in the same call. Neither touches money or terms.
 *
 * Call site: the tool registry.
 */
import { createHelper, recordBill, updateHelperProfile } from "@helper-assistant/core";
import type { Bill } from "@helper-assistant/domain";
import type { ToolHandlers } from "./context";
import { requireDocument } from "./documents";
import { notFound } from "./errors";

type RecordHandlers = Pick<ToolHandlers, "save_helper" | "record_bill">;

/** The check goes back once, beside the bill, rather than twice (latestCheck is that same check). */
const withoutLatestCheck = ({ latestCheck: _latestCheck, ...bill }: Bill) => bill;

export const recordHandlers: RecordHandlers = {
  /** helperId null creates; otherwise updates the helper as it stands now (status and endedOn are untouched). */
  save_helper: async ({ helperId, profile }, { deps }) => {
    if (helperId === null) return { created: true, helper: await createHelper(deps, profile) };
    const current = await deps.store.getHelper(helperId);
    if (current === null) throw notFound("Helper", helperId);
    return { created: false, helper: await updateHelperProfile(deps, { helperId, expectedVersion: current.version, profile }) };
  },

  /**
   * Saves and checks the bill. A bill for a period that's already approved is
   * refused by core (PERIOD_ALREADY_APPROVED) and nothing is saved.
   */
  record_bill: async (input, ctx) => {
    await requireDocument(ctx, input.docId);
    const { bill, check, supersededBillId } = await recordBill(ctx.deps, input);
    return { bill: withoutLatestCheck(bill), check, supersededBillId };
  },
};
