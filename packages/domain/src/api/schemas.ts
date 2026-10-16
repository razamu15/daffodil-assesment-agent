/**
 * Request/response bodies for the HTTP API (Doc 2 §4). Route table is in routes.ts.
 * Used by api (validation at the boundary), web (typed client) and the mock server.
 */
import { z } from "zod";
import { UPLOAD_MAX_TEXT_CHARS } from "../constants";
import { BlobMediaTypeSchema, DocumentKindSchema, DocumentStorage, PaymentMethodSchema } from "../enums";
import { AgreementTermSchema } from "../entities/agreement";
import { AcceptedExceptionSchema, BillSchema } from "../entities/bill";
import { SourceDocumentSchema } from "../entities/document";
import { PendingActionSchema } from "../entities/action";
import { HelperProfileSchema, HelperSchema } from "../entities/people";
import { PaymentRecordSchema } from "../entities/payment";
import {
  ChatMessageSchema,
  HelperNoteSchema,
  OutboundMessageSchema,
  SessionSchema,
} from "../entities/records";
import { TurnStatusSchema } from "../enums";
import { IdSchema, InstantSchema, LocalDateSchema, VersionSchema } from "../primitives";

// ── Errors ──────────────────────────────────────────────────────────────────

export const ApiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  /** A version or state precondition failed (someone else changed it first). */
  "CONFLICT",
  /** The session already has a running turn. */
  "SESSION_BUSY",
  /** Confirm/reject on an action that is no longer PENDING. */
  "ACTION_NOT_PENDING",
  /** Approve on a bill that isn't RECEIVED (approved or superseded). */
  "BILL_NOT_APPROVABLE",
  /** Mark-paid on a bill that isn't APPROVED, or is already paid. */
  "BILL_NOT_PAYABLE",
  "INTERNAL",
]);
export const ApiErrorCode = ApiErrorCodeSchema.enum;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  SESSION_BUSY: 409,
  ACTION_NOT_PENDING: 409,
  BILL_NOT_APPROVABLE: 409,
  BILL_NOT_PAYABLE: 409,
  INTERNAL: 500,
};

export const ApiErrorSchema = z.object({
  error: z.object({ code: ApiErrorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ── Auth and health ─────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({ password: z.string().min(1) });
export const LoginResponseSchema = z.object({ token: z.string(), expiresAt: InstantSchema });
export const HealthResponseSchema = z.object({ ok: z.literal(true) });

// ── Chat ────────────────────────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  /** null starts a new chat. */
  sessionId: IdSchema.nullable(),
  text: z.string(),
  /** Documents uploaded first via POST /api/documents. */
  attachmentDocIds: z.array(IdSchema),
});
export const ChatResponseSchema = z.object({ sessionId: IdSchema, turnId: IdSchema });

/** Poll view of a turn. Traces stay server-side. */
export const TurnViewSchema = z.object({
  turnId: IdSchema,
  sessionId: IdSchema,
  status: TurnStatusSchema,
  replyText: z.string().nullable(),
  /** Actions this turn proposed, so the UI can render cards inline. */
  proposedActions: z.array(PendingActionSchema),
  /**
   * Jordan's message that started the turn, exactly as chat history will store it
   * (userMessageText). History is written when the turn ends, so the UI shows
   * this meanwhile.
   */
  userMessage: ChatMessageSchema,
  error: z.string().nullable(),
});
export type TurnView = z.infer<typeof TurnViewSchema>;

export const SessionsResponseSchema = z.object({ sessions: z.array(SessionSchema) });
export const SessionMessagesResponseSchema = z.object({ messages: z.array(ChatMessageSchema) });

// ── Documents ───────────────────────────────────────────────────────────────

export const UploadDocumentRequestSchema = z.discriminatedUnion("storage", [
  z.object({
    storage: z.literal(DocumentStorage.INLINE_TEXT),
    kind: DocumentKindSchema,
    text: z.string().min(1).max(UPLOAD_MAX_TEXT_CHARS),
    /** The file's name when it came from a file; null for pasted text. */
    fileName: z.string().min(1).max(200).nullable(),
    messageDate: LocalDateSchema.nullable(),
    sessionId: IdSchema.nullable(),
  }),
  z.object({
    storage: z.literal(DocumentStorage.BLOB),
    kind: DocumentKindSchema,
    mediaType: BlobMediaTypeSchema,
    /** Images are resized by the UI first (UPLOAD_MAX_IMAGE_EDGE_PX); PDFs go as they are. */
    base64: z.string().min(1),
    /** The file's name when it came from a file; null for pasted text. */
    fileName: z.string().min(1).max(200).nullable(),
    messageDate: LocalDateSchema.nullable(),
    sessionId: IdSchema.nullable(),
  }),
]);
export type UploadDocumentRequest = z.infer<typeof UploadDocumentRequestSchema>;

export const DocumentResponseSchema = z.object({
  document: SourceDocumentSchema,
  /** Image bytes for BLOB documents, so the UI can show the source beside the extraction. null for text. */
  blobBase64: z.string().nullable(),
});

// ── Records ─────────────────────────────────────────────────────────────────

export const HelpersResponseSchema = z.object({ helpers: z.array(HelperSchema) });

/** Helper profile edits save directly (not gated). */
export const CreateHelperRequestSchema = z.object({ profile: HelperProfileSchema });
export const UpdateHelperRequestSchema = z.object({
  /** The version the user edited. Mismatch → CONFLICT. */
  helperVersion: VersionSchema,
  profile: HelperProfileSchema,
});
export const HelperResponseSchema = z.object({ helper: HelperSchema });

export const TermsResponseSchema = z.object({
  /** All versions, current and historical, ordered by effectiveFrom. */
  terms: z.array(AgreementTermSchema),
  notes: z.array(HelperNoteSchema),
  /** The source documents the terms point at. */
  documents: z.array(SourceDocumentSchema),
});

export const BillsResponseSchema = z.object({
  bills: z.array(BillSchema),
  /** Payment records for the listed bills (approved and paid). */
  payments: z.array(PaymentRecordSchema),
});

export const BillResponseSchema = z.object({
  bill: BillSchema,
  /** Terms referenced by the latest check, for "why this number". */
  terms: z.array(AgreementTermSchema),
  sourceDocument: SourceDocumentSchema,
  payment: PaymentRecordSchema.nullable(),
});

export const ActionsResponseSchema = z.object({ actions: z.array(PendingActionSchema) });
export const MessagesResponseSchema = z.object({ messages: z.array(OutboundMessageSchema) });

// ── The commit paths ────────────────────────────────────────────────────────

export const ConfirmActionRequestSchema = z.object({
  /** The action version the user was looking at. Mismatch → CONFLICT. */
  actionVersion: VersionSchema,
  /** HELPER_MESSAGE only: Jordan's edited text. null keeps the drafted body. */
  messageBody: z.string().min(1).nullable(),
});
/** 200 with the resolved action. status is CONFIRMED, or STALE if the basis changed (not an error). */
export const ConfirmActionResponseSchema = z.object({ action: PendingActionSchema });

export const RejectActionRequestSchema = z.object({ actionVersion: VersionSchema });
export const RejectActionResponseSchema = z.object({ action: PendingActionSchema });

/** UI Approve button = propose BILL_APPROVAL + confirm, in one request, through the same gate. */
export const ApproveBillRequestSchema = z.object({
  billVersion: VersionSchema,
  acceptedExceptions: z.array(AcceptedExceptionSchema),
});
export const ApproveBillResponseSchema = z.object({ bill: BillSchema, action: PendingActionSchema });

/** "Mark as paid" on an approved bill. Records Jordan's statement; moves no money. */
export const RecordPaymentRequestSchema = z.object({
  paidOn: LocalDateSchema,
  method: PaymentMethodSchema,
  note: z.string().nullable(),
});
export const RecordPaymentResponseSchema = z.object({ payment: PaymentRecordSchema });

export const MessageHandedOffResponseSchema = z.object({ message: OutboundMessageSchema });

export const EmptyBodySchema = z.object({}).strict();
