/**
 * Turns whatever Jordan drops in (files, or whole folders) into upload requests:
 * images (resized), text files (read as text) and PDFs (sent as they are).
 * Anything else comes back as unsupported with the reason, never silently dropped.
 *
 * Each file's document kind says only its format (KIND_BY_FORMAT). Whether it's
 * notes, a thread or a bill is read from its contents by the assistant.
 *
 * Call sites: chat/Composer.tsx (file picker, folder picker, drag and drop).
 */
import { DocumentKind, DocumentStorage, UPLOAD_MAX_BASE64_CHARS, UPLOAD_MAX_TEXT_CHARS } from "@helper-assistant/domain";
import type { DocumentKind as DocumentKindT, UploadDocumentRequest } from "@helper-assistant/domain";
import { resizeImageForUpload } from "./resizeImage";

/** An upload request minus the chat it goes to (known only at send time), per storage kind. */
export type UploadWithoutSession = UploadDocumentRequest extends infer R ? (R extends unknown ? Omit<R, "sessionId"> : never) : never;

export type IntakeResult = { name: string; request: UploadWithoutSession } | { name: string; unsupported: string };

export const FileFormat = { IMAGE: "IMAGE", TEXT: "TEXT", PDF: "PDF" } as const;
export type FileFormat = (typeof FileFormat)[keyof typeof FileFormat];

/** Text formats read as plain text, by extension (browsers often leave File.type empty for these). */
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "eml", "html", "htm", "xml", "log"]);

function formatOf(file: File): FileFormat | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/")) return FileFormat.IMAGE;
  if (file.type === "application/pdf" || extension === "pdf") return FileFormat.PDF;
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) return FileFormat.TEXT;
  return null;
}

/** A file is typed by its format only; the assistant reads what it is from the contents. */
const KIND_BY_FORMAT: Record<FileFormat, DocumentKindT> = {
  [FileFormat.IMAGE]: DocumentKind.IMAGE_FILE,
  [FileFormat.TEXT]: DocumentKind.TEXT_FILE,
  [FileFormat.PDF]: DocumentKind.PDF_FILE,
};

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function intakeFile(file: File): Promise<IntakeResult> {
  const name = file.webkitRelativePath || file.name;
  const format = formatOf(file);
  if (format === null) return { name, unsupported: "Only images, text files and PDFs can be read." };
  const kind = KIND_BY_FORMAT[format];
  try {
    if (format === FileFormat.IMAGE) {
      const { mediaType, base64 } = await resizeImageForUpload(file);
      return { name, request: { storage: DocumentStorage.BLOB, kind, mediaType, base64, fileName: file.name, messageDate: null } };
    }
    if (format === FileFormat.PDF) {
      const base64 = base64Of(await file.arrayBuffer());
      if (base64.length > UPLOAD_MAX_BASE64_CHARS) return { name, unsupported: "This PDF is too large (about 3 MB at most)." };
      return { name, request: { storage: DocumentStorage.BLOB, kind, mediaType: "application/pdf", base64, fileName: file.name, messageDate: null } };
    }
    const text = await file.text();
    if (text.trim() === "") return { name, unsupported: "The file is empty." };
    if (text.length > UPLOAD_MAX_TEXT_CHARS) return { name, unsupported: `The file is too long (over ${UPLOAD_MAX_TEXT_CHARS.toLocaleString()} characters).` };
    return { name, request: { storage: DocumentStorage.INLINE_TEXT, kind, text, fileName: file.name, messageDate: null } };
  } catch (e) {
    return { name, unsupported: e instanceof Error ? e.message : "Couldn't read this file." };
  }
}

/** Hidden files (".DS_Store") are system clutter, not something Jordan meant to attach. */
const isHidden = (file: File): boolean => (file.webkitRelativePath || file.name).split("/").some((part) => part.startsWith("."));

export function visibleFiles(files: Iterable<File>): File[] {
  return [...files].filter((f) => !isHidden(f)).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
}

/** Every file in a drop, walking into dropped folders. */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return [...dataTransfer.files];
  return (await Promise.all(entries.map(filesIn))).flat();
}

async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(filesIn))).flat();
}
