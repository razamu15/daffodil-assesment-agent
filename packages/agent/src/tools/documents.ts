/**
 * Source documents as tools see them. A tool that cites a document checks it
 * exists (and, where the domain says so, that its kind may serve that purpose)
 * at this boundary, so nothing downstream points at a missing source.
 *
 * Jordan's message this turn is materialized as a CHAT_STATEMENT document here,
 * the first time a tool cites its docId (Doc 3 §10 C14).
 *
 * Call sites: extract_from_document, record_bill, propose_agreement_change,
 * save_unstructured_note.
 */
import { saveDocument } from "@helper-assistant/core";
import { DocumentKind, DocumentStorage, ToolErrorCode } from "@helper-assistant/domain";
import type { DocumentKind as DocumentKindT, Id, SourceDocument } from "@helper-assistant/domain";
import type { ToolContext } from "./context";
import { notFound, ToolFailure } from "./errors";

export async function requireDocument(
  ctx: ToolContext,
  docId: Id,
  purpose: { allowedKinds: readonly DocumentKindT[]; why: string } | null = null,
): Promise<SourceDocument> {
  const document = (await ctx.deps.store.getDocument(docId)) ?? (await saveStatementIfCited(ctx, docId));
  if (document === null) throw notFound("Document", docId);
  if (purpose !== null && !purpose.allowedKinds.includes(document.kind)) {
    throw new ToolFailure(ToolErrorCode.NOT_ALLOWED, `Document ${docId} is ${document.kind}: ${purpose.why}`);
  }
  return document;
}

async function saveStatementIfCited(ctx: ToolContext, docId: Id): Promise<SourceDocument | null> {
  if (ctx.statement === null || ctx.statement.docId !== docId) return null;
  return saveDocument(ctx.deps, {
    docId,
    kind: DocumentKind.CHAT_STATEMENT,
    content: { storage: DocumentStorage.INLINE_TEXT, text: ctx.statement.text },
    // Typed in chat today, so today is when it was said.
    messageDate: ctx.deps.clock.today(),
    sessionId: ctx.sessionId,
  });
}
