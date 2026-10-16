/**
 * READ tools (no side effects). Answers come from the Store or core, never from
 * memory: money facts always come from tools (Doc 3 §4.5).
 *
 * Call site: the tool registry.
 */
import { checkBillById, getMonthStatus, isInEffectOn, previousMonth, sumOfLinesCentsOf } from "@helper-assistant/core";
import { NoteKind, NoteStatus, SOURCE_PRECEDENCE_RANK } from "@helper-assistant/domain";
import type { Helper, Id, Store } from "@helper-assistant/domain";
import type { ToolHandlers } from "./context";
import { notFound } from "./errors";

type ReadHandlers = Pick<
  ToolHandlers,
  "list_helpers" | "list_agreements" | "list_bills" | "get_bill" | "check_bill" | "get_month_status" | "list_pending_actions"
>;

async function requireHelper(store: Store, helperId: Id): Promise<Helper> {
  const helper = await store.getHelper(helperId);
  if (helper === null) throw notFound("Helper", helperId);
  return helper;
}

export const readHandlers: ReadHandlers = {
  /** Each helper with the service keys their terms use, so bill lines can reuse them. */
  list_helpers: async (_input, { deps: { store } }) => {
    const [helpers, terms] = await Promise.all([store.listHelpers(), store.listTerms()]);
    return {
      helpers: helpers.map((helper) => ({
        ...helper,
        services: [...new Map(terms.filter((t) => t.helperId === helper.helperId).map((t) => [t.serviceKey, t.serviceLabel])).entries()].map(
          ([serviceKey, serviceLabel]) => ({ serviceKey, serviceLabel }),
        ),
      })),
    };
  },

  /** asOf null = every version (current, closed, future-dated); a date = only terms in effect that day. */
  list_agreements: async ({ helperId, asOf }, { deps: { store } }) => {
    const helper = await requireHelper(store, helperId);
    const [terms, notes] = await Promise.all([store.listTerms({ helperId }), store.listNotes({ helperId })]);
    const shown = asOf === null ? terms : terms.filter((t) => isInEffectOn(t, asOf, terms));
    const documents = new Map(
      await Promise.all([...new Set(shown.map((t) => t.sourceDocId))].map(async (docId) => [docId, await store.getDocument(docId)] as const)),
    );
    return {
      helper: { helperId: helper.helperId, name: helper.name },
      asOf,
      terms: shown.map((term) => {
        const source = documents.get(term.sourceDocId) ?? null;
        return {
          ...term,
          source:
            source === null
              ? null
              : { kind: source.kind, precedenceRank: SOURCE_PRECEDENCE_RANK[source.kind], messageDate: source.messageDate },
        };
      }),
      unencodedTerms: notes.filter((n) => n.noteKind === NoteKind.UNENCODED_TERM && n.status === NoteStatus.OPEN),
    };
  },

  list_bills: async ({ month, helperId, status }, { deps: { store } }) => {
    const bills = await store.listBills({
      ...(month === null ? {} : { month }),
      ...(helperId === null ? {} : { helperId }),
      ...(status === null ? {} : { status }),
    });
    return {
      bills: bills.map((bill) => ({
        billId: bill.billId,
        helperId: bill.helperId,
        period: bill.period,
        status: bill.status,
        statedTotalCents: bill.statedTotalCents,
        sumOfLinesCents: sumOfLinesCentsOf(bill),
        verdict: bill.latestCheck?.verdict ?? null,
        receivedAt: bill.receivedAt,
        supersededByBillId: bill.supersededByBillId,
        amountApprovedCents: bill.approval?.amountApprovedCents ?? null,
      })),
    };
  },

  get_bill: async ({ billId }, { deps: { store } }) => {
    const bill = await store.getBill(billId);
    if (bill === null) throw notFound("Bill", billId);
    return { bill };
  },

  check_bill: async ({ billId }, { deps }) => ({ check: await checkBillById(deps, billId) }),

  /** month null = the most recent closed month, the one bills are due for (Doc 1 §4.2). */
  get_month_status: async ({ month }, { deps }) => getMonthStatus(deps, month ?? previousMonth(deps.clock.today())),

  /** status null = every status. */
  list_pending_actions: async ({ status }, { deps: { store } }) => ({
    actions: await store.listActions(status === null ? {} : { status }),
  }),
};
