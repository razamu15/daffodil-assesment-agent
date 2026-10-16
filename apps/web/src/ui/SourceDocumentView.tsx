/**
 * The original document, as Jordan gave it: text verbatim, the screenshot, or the PDF.
 * "Source beside extraction" (Product §8).
 *
 * Call sites: Bill screen (bill source), Agreements (term sources), Decisions (card sources).
 */
import { useState } from "react";
import { DocumentStorage, PdfMediaTypeSchema } from "@helper-assistant/domain";
import type { Id } from "@helper-assistant/domain";
import { useApiQuery } from "../app/AppContext";
import { Loaded } from "./common";
import { formatInstant, formatLongDate } from "./format";
import { DOCUMENT_KIND_LABEL } from "./labels";

export function SourceDocumentView({ docId, highlight }: { docId: Id; highlight?: string | null }) {
  const query = useApiQuery((api) => api.call("getDocument", { params: { id: docId } }), [docId]);
  return (
    <Loaded query={query}>
      {({ document, blobBase64 }) => (
        <figure className="source-doc">
          <figcaption>
            {DOCUMENT_KIND_LABEL[document.kind]} · added {formatInstant(document.receivedAt)}
            {document.messageDate !== null && <> · written {formatLongDate(document.messageDate)}</>}
          </figcaption>
          {document.content.storage === DocumentStorage.INLINE_TEXT ? (
            <pre className="source-text">{highlighted(document.content.text, highlight ?? null)}</pre>
          ) : blobBase64 === null ? (
            <p className="muted">The file isn't available.</p>
          ) : PdfMediaTypeSchema.safeParse(document.content.mediaType).success ? (
            <object className="source-pdf" type="application/pdf" data={`data:application/pdf;base64,${blobBase64}`}>
              <a href={`data:application/pdf;base64,${blobBase64}`} download={`${document.docId}.pdf`}>
                Download the PDF
              </a>
            </object>
          ) : (
            <img className="source-image" alt={DOCUMENT_KIND_LABEL[document.kind]} src={`data:${document.content.mediaType};base64,${blobBase64}`} />
          )}
        </figure>
      )}
    </Loaded>
  );
}

/** Marks the quoted words inside the source text, when they appear verbatim. */
function highlighted(text: string, quote: string | null) {
  const at = quote === null || quote === "" ? -1 : text.indexOf(quote);
  if (quote === null || at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

/** A "Show source" toggle that opens the document inline. */
export function SourceToggle({ docId, quote, label = "Show source" }: { docId: Id; quote?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="source-toggle">
      <button type="button" className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide source" : label}
      </button>
      {open && <SourceDocumentView docId={docId} highlight={quote ?? null} />}
    </div>
  );
}
