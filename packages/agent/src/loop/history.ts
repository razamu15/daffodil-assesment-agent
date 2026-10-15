/**
 * Chat history ⇄ model messages (Doc 3 §4.5). History holds Jordan's text and
 * the final assistant text only; tool traces live on the Turn, and the database
 * is truth, so the model re-queries instead of trusting old tool output.
 *
 * Converse needs alternating roles that start with the user, so consecutive
 * messages of one role (a failed turn leaves a user message with no reply) are
 * merged, and anything before the first user message is dropped.
 *
 * Call site: runTurn.
 */
import { ChatRole, ModelRole } from "@helper-assistant/domain";
import type { ChatMessage, ChatRole as ChatRoleT, DocumentKind, Id, ModelMessage, ModelRole as ModelRoleT } from "@helper-assistant/domain";

const MODEL_ROLE_BY_CHAT_ROLE: Record<ChatRoleT, ModelRoleT> = {
  [ChatRole.USER]: ModelRole.USER,
  [ChatRole.ASSISTANT]: ModelRole.ASSISTANT,
};

export function toModelMessages(chat: readonly ChatMessage[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const message of chat) {
    const role = MODEL_ROLE_BY_CHAT_ROLE[message.role];
    if (messages.length === 0 && role !== ModelRole.USER) continue;
    const last = messages.at(-1);
    if (last !== undefined && last.role === role) last.content.push({ type: "text", text: message.text });
    else messages.push({ role, content: [{ type: "text", text: message.text }] });
  }
  return messages;
}

/**
 * Jordan's message as stored and as the model sees it. Attachments are named by
 * id and kind only, never inlined: their content reaches the model solely
 * through the quarantined extraction call. The marker stays in history so a
 * later turn can still refer to the document.
 */
export function userMessageText(text: string, attachments: { docId: Id; kind: DocumentKind }[]): string {
  if (attachments.length === 0) return text;
  const marker = `[Attached: ${attachments.map((a) => `${a.docId} (${a.kind})`).join(", ")}]`;
  return text.trim() === "" ? marker : `${text}\n\n${marker}`;
}
