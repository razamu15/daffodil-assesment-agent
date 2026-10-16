/**
 * Document upload and download. Image bytes go to the BlobStore; the
 * SourceDocument record points at them. Base64 in JSON keeps an upload to one
 * request (Doc 2 §3); the size cap keeps it under Lambda's payload limit.
 *
 * Call site: createApp.
 */
import { ApiErrorCode, DocumentStorage, UPLOAD_MAX_BASE64_CHARS } from "@helper-assistant/domain";
import type { DocumentContent } from "@helper-assistant/domain";
import { saveDocument } from "@helper-assistant/core";
import { base64ToBytes, bytesToBase64 } from "../base64";
import type { AppDeps } from "../deps";
import { ApiFailure } from "../errors";
import type { RouteHandlers } from "../routing";

/** Where an uploaded document's bytes live in the BlobStore. */
const blobKeyFor = (docId: string) => `documents/${docId}`;

export function documentHandlers(deps: AppDeps) {
  const { store, blobStore, newId } = deps;
  return {
    uploadDocument: async ({ body }) => {
      const docId = newId();
      let content: DocumentContent;
      if (body.storage === DocumentStorage.BLOB) {
        if (body.base64.length > UPLOAD_MAX_BASE64_CHARS) {
          throw new ApiFailure(ApiErrorCode.VALIDATION_FAILED, `The file is too large (over ${UPLOAD_MAX_BASE64_CHARS} base64 characters, about ${Math.floor((UPLOAD_MAX_BASE64_CHARS * 3) / 4 / 1_000_000)} MB).`);
        }
        const bytes = base64ToBytes(body.base64);
        if (bytes === null) throw new ApiFailure(ApiErrorCode.VALIDATION_FAILED, "body.base64 isn't valid base64.");
        const blobKey = blobKeyFor(docId);
        await blobStore.put(blobKey, bytes, body.mediaType);
        content = { storage: DocumentStorage.BLOB, blobKey, mediaType: body.mediaType };
      } else {
        content = { storage: DocumentStorage.INLINE_TEXT, text: body.text };
      }
      const document = await saveDocument(deps, { docId, kind: body.kind, content, fileName: body.fileName, messageDate: body.messageDate, sessionId: body.sessionId });
      return { document, blobBase64: body.storage === DocumentStorage.BLOB ? body.base64 : null };
    },

    getDocument: async ({ params }) => {
      const document = await store.getDocument(params.id);
      if (document === null) throw new ApiFailure(ApiErrorCode.NOT_FOUND, `Document ${params.id} not found`);
      if (document.content.storage === DocumentStorage.INLINE_TEXT) return { document, blobBase64: null };
      const blob = await blobStore.get(document.content.blobKey);
      if (blob === null) throw new Error(`Bytes for document ${document.docId} are missing from the blob store`);
      return { document, blobBase64: bytesToBase64(blob.bytes) };
    },
  } satisfies Partial<RouteHandlers>;
}
