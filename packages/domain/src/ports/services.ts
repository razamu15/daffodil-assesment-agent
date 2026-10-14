/**
 * The non-store seams (Doc 4 §2): Clock, BlobStore, MemoryClient, TurnRunner.
 * Each has a fake (local, tests) and a real (AWS) implementation.
 */
import type { ImageMediaType } from "../enums";
import type { ChatMessage, MemoryHint } from "../entities/records";
import type { Id, Instant, LocalDate } from "../primitives";

/** Fake: FixedClock. Real: SystemClock. Makes "the 15th" and month status testable. */
export interface Clock {
  now(): Instant;
  /** Today in the household's local time. */
  today(): LocalDate;
}

/**
 * Bytes of uploaded screenshots. Fake: InMemoryBlobStore. Real: S3BlobStore (private bucket).
 * Keys are opaque strings chosen by the caller (api's upload handler).
 */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, mediaType: ImageMediaType): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; mediaType: ImageMediaType } | null>;
}

/**
 * Chat history and long-term hints. Fake: InMemoryMemory. Real: AgentCoreMemory.
 * Holds user text and final assistant text only; tool traces live on Turn.
 */
export interface MemoryClient {
  appendChatMessages(sessionId: Id, messages: ChatMessage[]): Promise<void>;
  /** Chronological, the most recent `maxMessages` of the session. */
  listChatMessages(sessionId: Id, options: { maxMessages: number }): Promise<ChatMessage[]>;
  /** Long-term records relevant to `query`. Extraction is async, so recent facts may be missing. */
  retrieveHints(query: string, options: { topK: number }): Promise<MemoryHint[]>;
}

/**
 * Starts an agent turn without waiting for it. Fake: LocalTurnRunner (in-process,
 * not awaited). Real: LambdaTurnRunner (async Lambda invoke). The turn's input is
 * already stored on the Turn record; the runner only needs its identity.
 */
export interface TurnRunner {
  /** Resolves once the turn is dispatched, not when it finishes. */
  start(turn: { turnId: Id; sessionId: Id }): Promise<void>;
}
