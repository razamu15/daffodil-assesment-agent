/**
 * SourceDocuments are immutable records of what Jordan gave us. For images the
 * caller has already put the bytes in the BlobStore under content.blobKey.
 *
 * Call site: api POST /api/documents.
 */
import { StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { SourceDocument } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { notFound } from "../errors";

export async function saveDocument(
  { store, clock }: Pick<CoreDeps, "store" | "clock">,
  document: Omit<SourceDocument, "receivedAt">,
): Promise<SourceDocument> {
  if (document.sessionId !== null && (await store.getSession(document.sessionId)) === null) throw notFound("Session", document.sessionId);
  const saved: SourceDocument = { ...document, receivedAt: clock.now() };
  await store.commit([{ record: { entity: StoredEntity.DOCUMENT, value: saved }, condition: { kind: WriteConditionKind.ABSENT } }]);
  return saved;
}
