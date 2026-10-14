/**
 * Smaller records: OutboundMessage, HelperNote, Session, Turn, ChatMessage, MemoryHint.
 */
import { z } from "zod";
import {
  ChatRoleSchema,
  ContactChannelSchema,
  DeliveryModeSchema,
  MemoryStrategySchema,
  MessageReasonSchema,
  MessageStatusSchema,
  ModelCallPurposeSchema,
  NoteKindSchema,
  NoteStatusSchema,
  TurnStatusSchema,
} from "../enums";
import { ActionRefSchema, IdSchema, InstantSchema, VersionSchema } from "../primitives";
import { BillingPeriodSchema } from "./bill";

/** A drafted message to a helper. Created READY when Jordan confirms the HELPER_MESSAGE action. Never sent by us. */
export const OutboundMessageSchema = z.object({
  messageId: IdSchema,
  helperId: IdSchema,
  reason: MessageReasonSchema,
  relatedBillId: IdSchema.nullable(),
  relatedPeriod: BillingPeriodSchema.nullable(),
  body: z.string().min(1),
  deliveryMode: DeliveryModeSchema,
  status: MessageStatusSchema,
  channelHint: ContactChannelSchema,
  createdByActionRef: ActionRefSchema,
  createdAt: InstantSchema,
  handedOffAt: InstantSchema.nullable(),
  version: VersionSchema,
});
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

/** The escape hatch (Doc 3 S3): what we couldn't encode, or a gap flagged for Jordan. */
export const HelperNoteSchema = z.object({
  noteId: IdSchema,
  noteKind: NoteKindSchema,
  helperId: IdSchema.nullable(),
  billId: IdSchema.nullable(),
  text: z.string().min(1),
  sourceDocId: IdSchema.nullable(),
  status: NoteStatusSchema,
  createdAt: InstantSchema,
  version: VersionSchema,
});
export type HelperNote = z.infer<typeof HelperNoteSchema>;

/** A chat. Messages live in AgentCore, not here (two copies would drift). */
export const SessionSchema = z.object({
  sessionId: IdSchema,
  title: z.string(),
  createdAt: InstantSchema,
  lastActiveAt: InstantSchema,
  /** Per-session lock: at most one running turn. */
  activeTurnId: IdSchema.nullable(),
  version: VersionSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const ToolCallTraceSchema = z.object({
  toolUseId: z.string(),
  name: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  isError: z.boolean(),
  startedAt: InstantSchema,
  durationMs: z.number().nonnegative(),
});
export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;

export const ModelCallTraceSchema = z.object({
  purpose: ModelCallPurposeSchema,
  stopReason: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  startedAt: InstantSchema,
  durationMs: z.number().nonnegative(),
});
export type ModelCallTrace = z.infer<typeof ModelCallTraceSchema>;

/** One agent run. Runs aren't reproducible, so the trace is the record. */
export const TurnSchema = z.object({
  turnId: IdSchema,
  sessionId: IdSchema,
  status: TurnStatusSchema,
  input: z.object({ text: z.string(), attachmentDocIds: z.array(IdSchema) }),
  replyText: z.string().nullable(),
  proposedActionRefs: z.array(ActionRefSchema),
  toolCalls: z.array(ToolCallTraceSchema),
  modelCalls: z.array(ModelCallTraceSchema),
  error: z.string().nullable(),
  createdAt: InstantSchema,
  startedAt: InstantSchema.nullable(),
  finishedAt: InstantSchema.nullable(),
  version: VersionSchema,
});
export type Turn = z.infer<typeof TurnSchema>;

/** A chat message as stored in AgentCore short-term memory: user text and final assistant text only. */
export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  text: z.string(),
  at: InstantSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** A long-term memory record retrieved as a background hint. May be outdated; the database is truth. */
export const MemoryHintSchema = z.object({
  text: z.string(),
  strategy: MemoryStrategySchema,
  score: z.number().nullable(),
});
export type MemoryHint = z.infer<typeof MemoryHintSchema>;
