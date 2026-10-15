/**
 * Read routes for the household's records, plus the direct (ungated) helper
 * profile saves. Reads go straight to the Store; month status is derived by core.
 *
 * Call site: createApp.
 */
import { ApiErrorCode } from "@helper-assistant/domain";
import type { AgreementTerm, Id, SourceDocument } from "@helper-assistant/domain";
import { createHelper, getMonthStatus, previousMonth, updateHelperProfile } from "@helper-assistant/core";
import type { AppDeps } from "../deps";
import { ApiFailure } from "../errors";
import type { RouteHandlers } from "../routing";

const notFound = (what: string, id: Id) => new ApiFailure(ApiErrorCode.NOT_FOUND, `${what} ${id} not found`);

/** A record points at a document that isn't stored: a broken invariant, not the caller's mistake. */
async function referencedDocuments({ store }: AppDeps, docIds: Iterable<Id>): Promise<SourceDocument[]> {
  return Promise.all(
    [...new Set(docIds)].map(async (docId) => {
      const document = await store.getDocument(docId);
      if (document === null) throw new Error(`Referenced document ${docId} is missing`);
      return document;
    }),
  );
}

export function recordHandlers(deps: AppDeps) {
  const { store, clock } = deps;
  return {
    health: async () => ({ ok: true as const }),

    listHelpers: async () => ({ helpers: await store.listHelpers() }),

    createHelper: async ({ body }) => ({ helper: await createHelper(deps, body.profile) }),

    updateHelper: async ({ params, body }) => ({
      helper: await updateHelperProfile(deps, { helperId: params.id, expectedVersion: body.helperVersion, profile: body.profile }),
    }),

    listTerms: async ({ query }) => {
      const [terms, notes] = await Promise.all([store.listTerms({ helperId: query.helperId }), store.listNotes({ helperId: query.helperId })]);
      const docIds = [...terms.map((t) => t.sourceDocId), ...notes.flatMap((n) => (n.sourceDocId === null ? [] : [n.sourceDocId]))];
      return { terms, notes, documents: await referencedDocuments(deps, docIds) };
    },

    listBills: async ({ query }) => {
      const bills = await store.listBills({ month: query.month, helperId: query.helperId, status: query.status });
      const billIds = new Set(bills.map((b) => b.billId));
      const payments = (await store.listPayments({ helperId: query.helperId })).filter((p) => billIds.has(p.billId));
      return { bills, payments };
    },

    getBill: async ({ params }) => {
      const bill = await store.getBill(params.id);
      if (bill === null) throw notFound("Bill", params.id);
      const termIds = bill.latestCheck?.termVersions.map((t) => t.termId) ?? [];
      const terms = await Promise.all(
        termIds.map(async (termId): Promise<AgreementTerm> => {
          const term = await store.getTerm(termId);
          if (term === null) throw new Error(`Term ${termId} referenced by bill ${bill.billId} is missing`);
          return term;
        }),
      );
      const [sourceDocument] = await referencedDocuments(deps, [bill.sourceDocId]);
      const [payment] = await store.listPayments({ billId: bill.billId });
      return { bill, terms, sourceDocument: sourceDocument!, payment: payment ?? null };
    },

    /** No month given: the most recent closed month as of the Clock. */
    getMonthStatus: async ({ query }) => getMonthStatus(deps, query.month ?? previousMonth(clock.today())),

    listActions: async ({ query }) => ({ actions: await store.listActions({ status: query.status }) }),

    listMessages: async ({ query }) => ({ messages: await store.listMessages({ helperId: query.helperId }) }),
  } satisfies Partial<RouteHandlers>;
}
