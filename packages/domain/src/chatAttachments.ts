/**
 * How a chat message names its attachments. The stored message text (what the
 * model sees in history) ends with one marker line listing each attached
 * document's id, kind and file name; the UI reads the same line back to show
 * the attachments as chips instead of raw ids. One format, written and read here.
 *
 * Call sites: agent loop/history.ts (writes it), web chat Conversation (reads it).
 */
import { z } from "zod";
import { DocumentKindSchema } from "./enums";
import { IdSchema } from "./primitives";

export const AttachmentRefSchema = z.object({ docId: IdSchema, kind: DocumentKindSchema, fileName: z.string().nullable() });
export type AttachmentRef = z.infer<typeof AttachmentRefSchema>;

const MARKER_PREFIX = "[Attached files: ";
const MARKER_SUFFIX = "]";

export function attachmentMarker(attachments: readonly AttachmentRef[]): string {
  return `${MARKER_PREFIX}${JSON.stringify(attachments)}${MARKER_SUFFIX}`;
}

/** The message text without its marker line, and the attachments it named. A malformed marker stays as text. */
export function splitAttachmentMarker(message: string): { text: string; attachments: AttachmentRef[] } {
  const lines = message.split("\n");
  const last = lines.at(-1) ?? "";
  if (!last.startsWith(MARKER_PREFIX) || !last.endsWith(MARKER_SUFFIX)) return { text: message, attachments: [] };
  try {
    const parsed = z.array(AttachmentRefSchema).safeParse(JSON.parse(last.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length)));
    if (!parsed.success) return { text: message, attachments: [] };
    return { text: lines.slice(0, -1).join("\n").trim(), attachments: parsed.data };
  } catch {
    return { text: message, attachments: [] };
  }
}
