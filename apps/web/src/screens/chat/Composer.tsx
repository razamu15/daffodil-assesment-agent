/**
 * The chat composer: text, plus documents to attach (pasted text or a
 * screenshot), each with what kind of document it is. Attachments are uploaded
 * first (POST /api/documents), then the turn starts with their ids.
 */
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { DocumentKind, DocumentStorage } from "@helper-assistant/domain";
import type { DocumentKind as DocumentKindT, Id, UploadDocumentRequest } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { resizeImageForUpload } from "../../lib/resizeImage";
import { ErrorNote } from "../../ui/common";
import { DOCUMENT_KIND_LABEL, IMAGE_UPLOAD_KINDS, TEXT_UPLOAD_KINDS } from "../../ui/labels";

/** An upload request minus the chat it goes to (known only at send time), per storage kind. */
type UploadWithoutSession = UploadDocumentRequest extends infer R ? (R extends unknown ? Omit<R, "sessionId"> : never) : never;
type Attachment = { key: number; name: string; request: UploadWithoutSession };

type Props = {
  sessionId: Id | null;
  initialText: string;
  disabled: boolean;
  /** Called with the new turn after it starts. */
  onStarted: (started: { sessionId: Id; turnId: Id }) => void;
};

export function Composer({ sessionId, initialText, disabled, onStarted }: Props) {
  const { api } = useApp();
  const [text, setText] = useState(initialText);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pasting, setPasting] = useState<{ kind: DocumentKindT; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const add = (name: string, request: Attachment["request"]) => setAttachments((list) => [...list, { key: nextKey.current++, name, request }]);

  const attachImage = async (file: File) => {
    setError(null);
    try {
      const { mediaType, base64 } = await resizeImageForUpload(file);
      add(file.name, { storage: DocumentStorage.BLOB, kind: DocumentKind.THREAD_SCREENSHOT, mediaType, base64, messageDate: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  };

  const setKind = (key: number, kind: DocumentKindT) => setAttachments((list) => list.map((a) => (a.key === key ? { ...a, request: { ...a.request, kind } } : a)));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const docIds: Id[] = [];
      for (const a of attachments) {
        const { document } = await api.call("uploadDocument", { body: { ...a.request, sessionId } as UploadDocumentRequest });
        docIds.push(document.docId);
      }
      const started = await api.call("chat", { body: { sessionId, text: text.trim(), attachmentDocIds: docIds } });
      setText("");
      setAttachments([]);
      onStarted(started);
    } catch (e) {
      setError(asClientError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const canSend = !busy && !disabled && (text.trim() !== "" || attachments.length > 0);

  return (
    <form className="composer" onSubmit={send}>
      {attachments.length > 0 && (
        <ul className="attachments">
          {attachments.map((a) => (
            <li key={a.key}>
              <span>{a.name}</span>
              <select value={a.request.kind} onChange={(e) => setKind(a.key, e.target.value as DocumentKindT)} aria-label="What is this?">
                {(a.request.storage === DocumentStorage.BLOB ? IMAGE_UPLOAD_KINDS : TEXT_UPLOAD_KINDS).map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="link-button" onClick={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {pasting !== null && (
        <div className="paste-box">
          <select value={pasting.kind} onChange={(e) => setPasting({ ...pasting, kind: e.target.value as DocumentKindT })} aria-label="What are you pasting?">
            {TEXT_UPLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <textarea rows={5} placeholder="Paste notes, a copied text thread, or a bill" value={pasting.text} onChange={(e) => setPasting({ ...pasting, text: e.target.value })} />
          <div className="form-actions">
            <button type="button" onClick={() => setPasting(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pasting.text.trim() === ""}
              onClick={() => {
                add(`${DOCUMENT_KIND_LABEL[pasting.kind]} (pasted)`, { storage: DocumentStorage.INLINE_TEXT, kind: pasting.kind, text: pasting.text, messageDate: null });
                setPasting(null);
              }}
            >
              Attach
            </button>
          </div>
        </div>
      )}
      <textarea
        className="composer-text"
        rows={2}
        placeholder="Ask anything, or tell the assistant what changed (“Lupe's last day is Oct 14”)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSend) void send(e);
        }}
      />
      <div className="composer-actions">
        <button type="button" onClick={() => fileInput.current?.click()}>
          Attach screenshot
        </button>
        <button type="button" onClick={() => setPasting({ kind: DocumentKind.TYPED_NOTES, text: "" })}>
          Paste text
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void attachImage(file);
            e.target.value = "";
          }}
        />
        <button type="submit" className="primary" disabled={!canSend}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {error !== null && <ErrorNote error={error} />}
    </form>
  );
}
