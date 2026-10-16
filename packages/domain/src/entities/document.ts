/**
 * SourceDocument (Doc 3 §2.3): an immutable record of something Jordan gave us.
 * Terms and bills point at it instead of copying it, so the UI can show the
 * original beside what was extracted.
 */
import { z } from "zod";
import { BlobMediaTypeSchema, DocumentKindSchema, DocumentStorage } from "../enums";
import { IdSchema, InstantSchema, LocalDateSchema } from "../primitives";

export const DocumentContentSchema = z.discriminatedUnion("storage", [
  z.object({ storage: z.literal(DocumentStorage.INLINE_TEXT), text: z.string().min(1) }),
  /** Image or PDF bytes live in the BlobStore under blobKey (S3 in AWS). */
  z.object({ storage: z.literal(DocumentStorage.BLOB), blobKey: z.string().min(1), mediaType: BlobMediaTypeSchema }),
]);
export type DocumentContent = z.infer<typeof DocumentContentSchema>;

export const SourceDocumentSchema = z.object({
  docId: IdSchema,
  kind: DocumentKindSchema,
  content: DocumentContentSchema,
  /** What Jordan's file was called ("07-lupe-september-bill.png"). null for pasted text and chat statements. */
  fileName: z.string().min(1).max(200).nullable(),
  /**
   * Date the message was written, if Jordan supplied it at upload. Usually null:
   * extraction then infers it and records the inference as an assumption.
   */
  messageDate: LocalDateSchema.nullable(),
  receivedAt: InstantSchema,
  /** Chat the document arrived in; null for uploads made outside a chat. */
  sessionId: IdSchema.nullable(),
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
