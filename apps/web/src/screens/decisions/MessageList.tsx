/**
 * Drafted messages Jordan has confirmed: copy, or open in Messages / Mail, then
 * "I sent it". The app never sends (Product P5); HANDED_OFF only records that
 * Jordan said so.
 *
 * Call sites: Decisions ("Ready for you to send"), Bill screen (messages about the bill).
 */
import { useState } from "react";
import { ContactChannel } from "@helper-assistant/domain";
import type { ContactChannel as ContactChannelT, Helper, OutboundMessage } from "@helper-assistant/domain";
import { MessageStatus } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { ErrorNote, StatusPill } from "../../ui/common";
import { formatInstant } from "../../ui/format";
import { MESSAGE_REASON_LABEL, MESSAGE_STATUS_VIEW } from "../../ui/labels";

/** Link that opens the helper's channel with the text filled in; null = copy only. */
const HANDOFF_LINK: Record<ContactChannelT, ((handle: string | null, body: string) => { href: string; label: string }) | null> = {
  [ContactChannel.SMS]: (handle, body) => ({ href: `sms:${handle ?? ""}?&body=${encodeURIComponent(body)}`, label: "Open in Messages" }),
  [ContactChannel.EMAIL]: (handle, body) => ({ href: `mailto:${handle ?? ""}?body=${encodeURIComponent(body)}`, label: "Open in Mail" }),
  [ContactChannel.UNKNOWN]: null,
};

export function MessageList({ messages, helpers }: { messages: OutboundMessage[]; helpers: Helper[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="message-list">
      {messages.map((m) => (
        <MessageItem key={m.messageId} message={m} helper={helpers.find((h) => h.helperId === m.helperId) ?? null} />
      ))}
    </ul>
  );
}

function MessageItem({ message, helper }: { message: OutboundMessage; helper: Helper | null }) {
  const { api, refresh } = useApp();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = HANDOFF_LINK[message.channelHint]?.(helper?.contact.handle ?? null, message.body) ?? null;

  const copy = async () => {
    await navigator.clipboard.writeText(message.body).then(
      () => setCopied(true),
      () => setError("Couldn't copy. Select the text and copy it yourself."),
    );
  };
  const handedOff = async () => {
    try {
      await api.call("markMessageHandedOff", { params: { id: message.messageId } });
      refresh();
    } catch (e) {
      setError(asClientError(e).message);
    }
  };

  return (
    <li className="message">
      <div className="message-head">
        <strong>To {helper?.name ?? "helper"}</strong>
        <span className="muted">{MESSAGE_REASON_LABEL[message.reason]}</span>
        <StatusPill view={MESSAGE_STATUS_VIEW[message.status]} />
      </div>
      <blockquote className="message-body">{message.body}</blockquote>
      {message.status === MessageStatus.READY ? (
        <div className="message-actions">
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          {link !== null && (
            <a className="button" href={link.href}>
              {link.label}
            </a>
          )}
          <button type="button" className="primary" onClick={handedOff}>
            I sent it
          </button>
        </div>
      ) : (
        message.handedOffAt !== null && <p className="muted small">You marked it sent on {formatInstant(message.handedOffAt)}.</p>
      )}
      {error !== null && <ErrorNote error={error} />}
    </li>
  );
}
