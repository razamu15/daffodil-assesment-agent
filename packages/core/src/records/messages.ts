/**
 * "I sent it": Jordan copied the drafted message or opened it in Messages. We
 * can't know it was sent, so the status is HANDED_OFF, never SENT. Repeating the
 * click is harmless and returns the message unchanged.
 *
 * Call site: api POST /api/messages/:id/handed-off.
 */
import { MessageStatus, StoreCommitError, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { Id, OutboundMessage } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";

export async function markMessageHandedOff({ store, clock }: Pick<CoreDeps, "store" | "clock">, messageId: Id): Promise<OutboundMessage> {
  const message = await store.getMessage(messageId);
  if (message === null) throw notFound("Message", messageId);
  if (message.status === MessageStatus.HANDED_OFF) return message;
  if (message.status !== MessageStatus.READY) {
    throw new CoreError(CoreErrorCode.CONFLICT, `Message ${messageId} is ${message.status} and can't be handed off.`);
  }
  const handedOff: OutboundMessage = { ...message, status: MessageStatus.HANDED_OFF, handedOffAt: clock.now(), version: message.version + 1 };
  try {
    await store.commit([{ record: { entity: StoredEntity.MESSAGE, value: handedOff }, condition: { kind: WriteConditionKind.VERSION, expected: message.version } }]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw new CoreError(CoreErrorCode.CONFLICT, `Message ${messageId} changed meanwhile. Reload it.`);
    throw error;
  }
  return handedOff;
}
