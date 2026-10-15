/**
 * ESCAPE tools, the honest exit (Doc 3 S3, §10 C11): store what the rule
 * vocabulary can't express (UNENCODED_TERM), or surface a gap to Jordan
 * (REVIEW_FLAG). Both persist as HelperNotes, OPEN until resolved.
 *
 * Core has no note-writing function yet, so the write lives here (see the
 * Track B report: "move HelperNote creation into core/records").
 *
 * Call site: the tool registry.
 */
import { NoteKind, NoteStatus, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { HelperNote, Id } from "@helper-assistant/domain";
import type { ToolContext, ToolHandlers } from "./context";
import { requireDocument } from "./documents";
import { notFound } from "./errors";

type EscapeHandlers = Pick<ToolHandlers, "save_unstructured_note" | "flag_for_review">;

async function requireExisting(ctx: ToolContext, refs: { helperId: Id | null; billId: Id | null }): Promise<void> {
  const { store } = ctx.deps;
  if (refs.helperId !== null && (await store.getHelper(refs.helperId)) === null) throw notFound("Helper", refs.helperId);
  if (refs.billId !== null && (await store.getBill(refs.billId)) === null) throw notFound("Bill", refs.billId);
}

async function saveNote(ctx: ToolContext, note: Pick<HelperNote, "noteKind" | "helperId" | "billId" | "text" | "sourceDocId">): Promise<HelperNote> {
  const { store, clock, newId } = ctx.deps;
  const saved: HelperNote = { ...note, noteId: newId(), status: NoteStatus.OPEN, createdAt: clock.now(), version: 1 };
  await store.commit([{ record: { entity: StoredEntity.NOTE, value: saved }, condition: { kind: WriteConditionKind.ABSENT } }]);
  return saved;
}

export const escapeHandlers: EscapeHandlers = {
  save_unstructured_note: async ({ helperId, text, sourceDocId }, ctx) => {
    await requireExisting(ctx, { helperId, billId: null });
    if (sourceDocId !== null) await requireDocument(ctx, sourceDocId);
    return { note: await saveNote(ctx, { noteKind: NoteKind.UNENCODED_TERM, helperId, billId: null, text, sourceDocId }) };
  },

  flag_for_review: async ({ reason, helperId, billId }, ctx) => {
    await requireExisting(ctx, { helperId, billId });
    return { note: await saveNote(ctx, { noteKind: NoteKind.REVIEW_FLAG, helperId, billId, text: reason, sourceDocId: null }) };
  },
};
