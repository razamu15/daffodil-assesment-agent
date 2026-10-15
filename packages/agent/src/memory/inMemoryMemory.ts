/**
 * InMemoryMemory: the MemoryClient fake (Doc 4 §2 seam). Chat history per
 * session in a Map. Long-term hints are whatever a test or demo seeds with
 * addHint; there is no background extraction, so retrieveHints returns the
 * seeded hints in insertion order (no relevance ranking).
 *
 * Call sites: agent tests, the CLI and scenario runner, apps/local-server.
 */
import type { ChatMessage, Id, MemoryClient, MemoryHint } from "@helper-assistant/domain";

export class InMemoryMemory implements MemoryClient {
  private readonly chats = new Map<Id, ChatMessage[]>();
  private readonly hints: MemoryHint[] = [];

  async appendChatMessages(sessionId: Id, messages: ChatMessage[]): Promise<void> {
    this.chats.set(sessionId, [...(this.chats.get(sessionId) ?? []), ...structuredClone(messages)]);
  }

  async listChatMessages(sessionId: Id, { maxMessages }: { maxMessages: number }): Promise<ChatMessage[]> {
    return structuredClone((this.chats.get(sessionId) ?? []).slice(-maxMessages));
  }

  async retrieveHints(_query: string, { topK }: { topK: number }): Promise<MemoryHint[]> {
    return structuredClone(this.hints.slice(0, topK));
  }

  addHint(hint: MemoryHint): void {
    this.hints.push(hint);
  }
}
