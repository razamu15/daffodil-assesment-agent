/**
 * Start a chat turn from a button ("Draft a reminder", "Ask Lupe about this",
 * "Resolve in chat") and open the chat, where the turn is polled and its cards
 * appear.
 *
 * Call sites: Home (reminders), Bill screen (ask the helper, resolve in chat).
 */
import type { Bill, BillCheck, Helper } from "@helper-assistant/domain";
import type { ApiClient } from "../api/client";
import { groupedReasons, itemsNeedingDecision } from "../ui/checkItems";
import { formatPeriod } from "../ui/format";
import { navigate, routes } from "./routes";

export async function startChat(api: ApiClient, text: string): Promise<void> {
  const { sessionId } = await api.call("chat", { body: { sessionId: null, text, attachmentDocIds: [] } });
  navigate(routes.chat(sessionId));
}

/**
 * A new chat about one bill: its id (the assistant loads the bill, check and
 * agreements with its tools) and every item the check flagged, so Jordan and the
 * assistant can work through them and Jordan confirms the fixes that make sense.
 */
export async function resolveBillInChat(api: ApiClient, { bill, check, helper }: { bill: Bill; check: BillCheck; helper: Helper }): Promise<void> {
  const flagged = groupedReasons(itemsNeedingDecision(check, bill.lineItems)).map((r) => `- ${r.titles}: ${r.short}`);
  const text = [
    `Help me resolve ${helper.name}'s ${formatPeriod(bill.period)} bill (bill ${bill.billId}).`,
    flagged.length > 0 ? `The check flagged:\n${flagged.join("\n")}` : "",
    "Go through each item with me, explain why it was flagged, and propose fixes I can pick from.",
  ]
    .filter((part) => part !== "")
    .join("\n\n");
  await startChat(api, text);
}
