/**
 * The chat composer: text, plus documents to attach. Files and whole folders can
 * be picked or dropped (lib/fileIntake.ts reads images, text files and PDFs);
 * text can also be pasted. Each attachment shows a suggested kind Jordan can
 * change. Attachments are uploaded first (POST /api/documents), then the turn
 * starts with their ids. Unsent text and attachments are kept per chat until
 * sent (drafts.ts).
 */
import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { DocumentKind, DocumentStorage, PdfMediaTypeSchema } from "@helper-assistant/domain";
import type { DocumentKind as DocumentKindT, Id, UploadDocumentRequest } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { filesFromDrop, intakeFile, visibleFiles } from "../../lib/fileIntake";
import type { UploadWithoutSession } from "../../lib/fileIntake";
import { ErrorNote } from "../../ui/common";
import { DOCUMENT_KIND_LABEL, IMAGE_UPLOAD_KINDS, PDF_UPLOAD_KINDS, TEXT_UPLOAD_KINDS } from "../../ui/labels";
import { clearDraft, loadDraft, saveDraft } from "./drafts";
import type { DraftAttachment } from "./drafts";

type Props = {
  sessionId: Id | null;
  /** Prefill from a "Change this…" link; replaces a saved draft's text. */
  initialText: string;
  disabled: boolean;
  /** Called with the new turn after it starts. */
  onStarted: (started: { sessionId: Id; turnId: Id }) => void;
};

/** Kinds Jordan can choose between for an attachment, by how it's stored. */
function kindChoices(request: UploadWithoutSession): readonly DocumentKindT[] {
  if (request.storage === DocumentStorage.INLINE_TEXT) return TEXT_UPLOAD_KINDS;
  return PdfMediaTypeSchema.safeParse(request.mediaType).success ? PDF_UPLOAD_KINDS : IMAGE_UPLOAD_KINDS;
}

export function Composer({ sessionId, initialText, disabled, onStarted }: Props) {
  const { api } = useApp();
  const [saved] = useState(() => loadDraft(sessionId));
  const [text, setText] = useState(initialText !== "" ? initialText : saved.text);
  const [attachments, setAttachments] = useState<DraftAttachment[]>(saved.attachments);
  const [unsupported, setUnsupported] = useState<{ name: string; reason: string }[]>([]);
  const [pasting, setPasting] = useState<{ kind: DocumentKindT; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const nextKey = useRef(saved.attachments.reduce((max, a) => Math.max(max, a.key + 1), 0));

  useEffect(() => saveDraft(sessionId, { text, attachments }), [sessionId, text, attachments]);

  const add = (name: string, request: UploadWithoutSession) => setAttachments((list) => [...list, { key: nextKey.current++, name, request }]);

  const attachFiles = async (files: File[]) => {
    setError(null);
    const visible = visibleFiles(files);
    setProgress(`Reading ${visible.length} file${visible.length === 1 ? "" : "s"}…`);
    const results = await Promise.all(visible.map(intakeFile));
    setProgress(null);
    for (const r of results) if ("request" in r) add(r.name, r.request);
    setUnsupported(results.flatMap((r) => ("unsupported" in r ? [{ name: r.name, reason: r.unsupported }] : [])));
  };

  const setKind = (key: number, kind: DocumentKindT) =>
    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, request: { ...a.request, kind } as UploadWithoutSession } : a)));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const docIds: Id[] = [];
      for (const [i, a] of attachments.entries()) {
        setProgress(`Uploading ${i + 1} of ${attachments.length}: ${a.name}`);
        const { document } = await api.call("uploadDocument", { body: { ...a.request, sessionId } as UploadDocumentRequest });
        docIds.push(document.docId);
      }
      setProgress("Starting…");
      const started = await api.call("chat", { body: { sessionId, text: text.trim(), attachmentDocIds: docIds } });
      clearDraft(sessionId);
      setText("");
      setAttachments([]);
      setUnsupported([]);
      onStarted(started);
    } catch (e) {
      setError(asClientError(e).message);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const canSend = !busy && !disabled && (text.trim() !== "" || attachments.length > 0);

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) await attachFiles(await filesFromDrop(event.dataTransfer));
  };

  return (
    <form
      className={`composer${dragging ? " dragging" : ""}`}
      onSubmit={send}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      {attachments.length > 0 && (
        <>
          <p className="muted small">Check what each file is. The assistant reads bills and agreements differently.</p>
          <ul className="attachments">
            {attachments.map((a) => (
              <li key={a.key}>
                <span>{a.name}</span>
                <select value={a.request.kind} onChange={(e) => setKind(a.key, e.target.value as DocumentKindT)} aria-label="What is this?">
                  {kindChoices(a.request).map((k) => (
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
        </>
      )}
      {unsupported.length > 0 && (
        <ul className="attachments unsupported">
          {unsupported.map((u) => (
            <li key={u.name}>
              <span>{u.name}</span>
              <span className="muted small">Not attached: {u.reason}</span>
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
                add(`${DOCUMENT_KIND_LABEL[pasting.kind]} (pasted)`, { storage: DocumentStorage.INLINE_TEXT, kind: pasting.kind, text: pasting.text, fileName: null, messageDate: null });
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
        placeholder="Ask anything, or drop in notes, screenshots, bills or a whole folder"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSend) void send(e);
        }}
      />
      <div className="composer-actions">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          Attach files
        </button>
        <button type="button" onClick={() => folderInput.current?.click()} disabled={busy}>
          Attach a folder
        </button>
        <button type="button" onClick={() => setPasting({ kind: DocumentKind.TYPED_NOTES, text: "" })} disabled={busy}>
          Paste text
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void attachFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...({ webkitdirectory: "" } as object)}
          onChange={(e) => {
            void attachFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {progress !== null && <span className="muted small">{progress}</span>}
        <button type="submit" className="primary" disabled={!canSend}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {error !== null && <ErrorNote error={error} />}
    </form>
  );
}
