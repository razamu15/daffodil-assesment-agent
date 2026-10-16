/**
 * Unsent composer content, kept until Jordan sends it: per chat (or "new" for a
 * chat not started yet). Text survives a reload (localStorage); attachments live
 * in memory only, so they survive moving between screens but not a reload (file
 * contents can exceed what localStorage holds).
 *
 * Call sites: Composer.tsx (read on mount, write on change, clear on send).
 */
import type { Id } from "@helper-assistant/domain";
import type { IntakeResult } from "../../lib/fileIntake";

export type DraftAttachment = Extract<IntakeResult, { request: unknown }> & { key: number };
export type Draft = { text: string; attachments: DraftAttachment[] };

const NEW_CHAT = "new";
const TEXT_STORAGE_PREFIX = "helper-assistant.draft.";

const attachmentsByChat = new Map<string, DraftAttachment[]>();

const keyOf = (sessionId: Id | null): string => sessionId ?? NEW_CHAT;

function readText(key: string): string {
  try {
    return localStorage.getItem(TEXT_STORAGE_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeText(key: string, text: string): void {
  try {
    if (text === "") localStorage.removeItem(TEXT_STORAGE_PREFIX + key);
    else localStorage.setItem(TEXT_STORAGE_PREFIX + key, text);
  } catch {
    // Storage blocked (private window): the draft just won't survive a reload.
  }
}

export function loadDraft(sessionId: Id | null): Draft {
  const key = keyOf(sessionId);
  return { text: readText(key), attachments: attachmentsByChat.get(key) ?? [] };
}

export function saveDraft(sessionId: Id | null, draft: Draft): void {
  const key = keyOf(sessionId);
  writeText(key, draft.text);
  if (draft.attachments.length === 0) attachmentsByChat.delete(key);
  else attachmentsByChat.set(key, draft.attachments);
}

export function clearDraft(sessionId: Id | null): void {
  saveDraft(sessionId, { text: "", attachments: [] });
}
