/**
 * Start a chat turn from a button ("Draft a reminder", "Ask Lupe about this")
 * and open the chat, where the turn is polled and its cards appear.
 *
 * Call sites: Month screen (reminders), Bill screen (ask the helper), Agreements ("Change this…").
 */
import type { ApiClient } from "../api/client";
import { navigate, routes } from "./routes";

export async function startChat(api: ApiClient, text: string): Promise<void> {
  const { sessionId } = await api.call("chat", { body: { sessionId: null, text, attachmentDocIds: [] } });
  navigate(routes.chat(sessionId));
}
