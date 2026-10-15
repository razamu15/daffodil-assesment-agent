/**
 * Read routes and direct saves (helper profiles, documents): everything that
 * isn't a gated commit or chat.
 */
import { deriveMonthStatus } from "@helper-assistant/core";
import { ApiErrorCode, DocumentStorage, HelperStatus } from "@helper-assistant/domain";
import type { Id, SourceDocument } from "@helper-assistant/domain";
import { monthOf, mostRecentClosedMonth } from "../../lib/months";
import { MockApiError } from "../errors";
import type { Handlers } from "./types";

type RecordRoutes =
  | "listHelpers"
  | "createHelper"
  | "updateHelper"
  | "listTerms"
  | "listBills"
  | "getBill"
  | "getMonthStatus"
  | "listActions"
  | "listMessages"
  | "uploadDocument"
  | "getDocument"
  | "listSessions"
  | "getSessionMessages";

export const recordHandlers: Pick<Handlers, RecordRoutes> = {
  listHelpers: (world) => ({ helpers: world.helpers }),

  createHelper: (world, { body }) => {
    const helper = { ...body.profile, helperId: world.newId("helper"), status: HelperStatus.ACTIVE, endedOn: null, version: 1 };
    world.helpers.push(helper);
    return { helper };
  },

  updateHelper: (world, { params, body }) => {
    const helper = world.helper(params.id);
    if (helper.version !== body.helperVersion) {
      throw new MockApiError(ApiErrorCode.CONFLICT, `${helper.name}'s details changed since you opened them (version ${helper.version}, you edited ${body.helperVersion}). Reload and try again.`);
    }
    const updated = { ...helper, ...body.profile, version: helper.version + 1 };
    world.replace(world.helpers, (h) => h.helperId === helper.helperId, updated);
    return { helper: updated };
  },

  listTerms: (world, { query }) => {
    const matches = <T extends { helperId: Id | null }>(r: T) => query.helperId === undefined || r.helperId === query.helperId;
    const terms = world.terms.filter(matches).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const docIds = new Set(terms.map((t) => t.sourceDocId));
    return { terms, notes: world.notes.filter(matches), documents: world.documents.filter((d) => docIds.has(d.docId)) };
  },

  listBills: (world, { query }) => {
    const bills = world.bills.filter(
      (b) =>
        (query.month === undefined || monthOf(b.period.start) === query.month) &&
        (query.helperId === undefined || b.helperId === query.helperId) &&
        (query.status === undefined || b.status === query.status),
    );
    const billIds = new Set(bills.map((b) => b.billId));
    return { bills, payments: world.payments.filter((p) => billIds.has(p.billId)) };
  },

  getBill: (world, { params }) => {
    const bill = world.bill(params.id);
    const referenced = new Set([...(bill.latestCheck?.termVersions ?? []), ...(bill.approval?.termVersions ?? [])].map((t) => t.termId));
    return {
      bill,
      terms: world.terms.filter((t) => referenced.has(t.termId)),
      sourceDocument: world.document(bill.sourceDocId),
      payment: world.payments.find((p) => p.billId === bill.billId) ?? null,
    };
  },

  getMonthStatus: (world, { query }) => {
    const month = query.month ?? mostRecentClosedMonth(world.today);
    return deriveMonthStatus({
      month,
      today: world.today,
      helpers: world.helpers,
      bills: world.bills.filter((b) => monthOf(b.period.start) === month),
      messages: world.messages,
      payments: world.payments,
    });
  },

  listActions: (world, { query }) => ({ actions: world.actions.filter((a) => query.status === undefined || a.status === query.status) }),

  listMessages: (world, { query }) => ({ messages: world.messages.filter((m) => query.helperId === undefined || m.helperId === query.helperId) }),

  uploadDocument: (world, { body }) => {
    const docId = world.newId("doc");
    const base = { docId, kind: body.kind, messageDate: body.messageDate, receivedAt: world.now(), sessionId: body.sessionId };
    let document: SourceDocument;
    if (body.storage === DocumentStorage.BLOB) {
      world.blobs.set(docId, body.base64);
      document = { ...base, content: { storage: DocumentStorage.BLOB, blobKey: `uploads/${docId}`, mediaType: body.mediaType } };
    } else {
      document = { ...base, content: { storage: DocumentStorage.INLINE_TEXT, text: body.text } };
    }
    world.documents.push(document);
    return { document, blobBase64: body.storage === DocumentStorage.BLOB ? body.base64 : null };
  },

  getDocument: (world, { params }) => {
    const document = world.document(params.id);
    return { document, blobBase64: document.content.storage === DocumentStorage.BLOB ? (world.blobs.get(document.docId) ?? null) : null };
  },

  listSessions: (world) => ({ sessions: [...world.sessions].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)) }),

  getSessionMessages: (world, { params }) => ({ messages: world.chat.get(world.session(params.id).sessionId) ?? [] }),
};
