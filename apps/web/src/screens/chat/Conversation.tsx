/**
 * One chat: its messages, the cards still waiting on Jordan, drafted messages to
 * send, and the composer. A turn runs in the background (Doc 2 §3 "Chat turn");
 * the UI polls GET /api/turns/:id every TURN_POLL_INTERVAL_MS until it finishes.
 * Decided cards are not shown here (ChatScreen lists them in DecidedPanel).
 *
 * Call sites: ChatScreen (full screen), HomeScreen (the side panel).
 */
import { useEffect, useRef, useState } from "react";
import { ChatRole, PendingActionStatus, splitAttachmentMarker, TURN_POLL_INTERVAL_MS, TurnStatus } from "@helper-assistant/domain";
import type { AgreementTerm, ChatMessage, Helper, Id, OutboundMessage, PendingAction, Session, TurnStatus as TurnStatusT } from "@helper-assistant/domain";
import { asClientError, useApiQuery, useApp } from "../../app/AppContext";
import { ErrorNote, Loaded } from "../../ui/common";
import { DOCUMENT_KIND_LABEL } from "../../ui/labels";
import { Markdown } from "../../ui/Markdown";
import { ActionGroups } from "../decisions/ActionGroups";
import { MessageList } from "../decisions/MessageList";
import { Composer } from "./Composer";

type ConversationData = {
  session: Session | null;
  messages: ChatMessage[];
  pending: PendingAction[];
  helpers: Helper[];
  terms: AgreementTerm[];
  /** Drafts confirmed from this chat's cards, ready to copy. */
  outbound: OutboundMessage[];
};

/** The empty-chat intro both chat surfaces use. */
export const CHAT_INTRO = {
  title: "Add what you have",
  body: "Paste notes, drop screenshots, bills or a whole folder. You'll see what the assistant understood next to the original, and nothing is saved until you confirm.",
};

const FINISHED_TURN: readonly TurnStatusT[] = [TurnStatus.COMPLETED, TurnStatus.FAILED];

type Props = {
  sessionId: Id | null;
  /** Prefill for the composer ("Change this…" links). */
  draft: string | null;
  /** A new chat was created by the first message. */
  onSessionStarted: (sessionId: Id) => void;
  /** Shown above an empty new chat. */
  intro: { title: string; body: string };
};

export function Conversation(props: Props) {
  const { sessionId } = props;
  const query = useApiQuery(async (api): Promise<ConversationData> => {
    const [{ sessions }, { actions }, { helpers }, { terms }, { messages: outbound }, messages] = await Promise.all([
      api.call("listSessions"),
      api.call("listActions"),
      api.call("listHelpers"),
      api.call("listTerms"),
      api.call("listMessages"),
      sessionId === null ? Promise.resolve([]) : api.call("getSessionMessages", { params: { id: sessionId } }).then((r) => r.messages),
    ]);
    const mine = actions.filter((a) => sessionId !== null && a.sourceSessionId === sessionId);
    const refs = new Set(mine.map((a) => a.ref));
    return {
      session: sessions.find((s) => s.sessionId === sessionId) ?? null,
      messages,
      helpers,
      terms,
      pending: mine.filter((a) => a.status === PendingActionStatus.PENDING),
      outbound: outbound.filter((m) => refs.has(m.createdByActionRef)),
    };
  }, [sessionId]);
  return <Loaded query={query}>{(data) => <ConversationView {...data} {...props} />}</Loaded>;
}

/** Jordan's message: the text, and any attached files as chips (named by the shared attachment marker). */
function UserBubble({ text }: { text: string }) {
  const { text: body, attachments } = splitAttachmentMarker(text);
  return (
    <li className="bubble user">
      {body !== "" && <div className="bubble-text">{body}</div>}
      {attachments.length > 0 && (
        <ul className="file-chips" aria-label="Attached files">
          {attachments.map((a) => (
            <li key={a.docId} className="file-chip" title={DOCUMENT_KIND_LABEL[a.kind]}>
              <span aria-hidden="true">📄</span> {a.fileName ?? DOCUMENT_KIND_LABEL[a.kind]}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

type TurnPolling = {
  running: boolean;
  /** Jordan's message that started the running turn; chat history only gets it when the turn ends. */
  sentMessage: ChatMessage | null;
  error: string | null;
};

/**
 * Polls a running turn, starting at once so Jordan's message shows right away;
 * refreshes the app when it finishes so the reply and its cards appear.
 */
function useTurnPolling(turnId: Id | null): TurnPolling {
  const { api, refresh } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [finishedTurnId, setFinishedTurnId] = useState<Id | null>(null);
  const [sent, setSent] = useState<{ turnId: Id; message: ChatMessage } | null>(null);
  useEffect(() => {
    if (turnId === null) return;
    let live = true;
    const poll = async () => {
      try {
        const turn = await api.call("getTurn", { params: { id: turnId } });
        if (!live) return;
        setSent({ turnId, message: turn.userMessage });
        if (FINISHED_TURN.includes(turn.status)) {
          if (turn.status === TurnStatus.FAILED) setError(turn.error ?? "The assistant couldn't finish that. Try again.");
          setFinishedTurnId(turnId);
          refresh();
        } else timer = setTimeout(poll, TURN_POLL_INTERVAL_MS);
      } catch (e) {
        if (live) setError(asClientError(e).message);
      }
    };
    let timer = setTimeout(poll, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, turnId]);
  const running = turnId !== null && turnId !== finishedTurnId && error === null;
  return { running, sentMessage: running && sent?.turnId === turnId ? sent.message : null, error };
}

function ConversationView({ session, messages, pending, helpers, terms, outbound, sessionId, draft, onSessionStarted, intro }: ConversationData & Props) {
  const { refresh } = useApp();
  const [startedTurnId, setStartedTurnId] = useState<Id | null>(null);
  const { running, sentMessage, error } = useTurnPolling(session?.activeTurnId ?? startedTurnId);

  // Follow the conversation: show the newest message and cards as they arrive.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = scrollRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages.length, pending.length, running, sentMessage]);

  return (
    <div className="conversation">
      <div className="conversation-scroll" ref={scrollRef}>
        {sessionId !== null && session === null && <ErrorNote error="That chat doesn't exist." />}
        {sessionId === null && messages.length === 0 && (
          <div className="chat-intro">
            <h2>{intro.title}</h2>
            <p>{intro.body}</p>
          </div>
        )}
        <ol className="messages">
          {messages.map((m, i) =>
            m.role === ChatRole.USER ? <UserBubble key={`${m.at}-${i}`} text={m.text} /> : (
              <li key={`${m.at}-${i}`} className="bubble assistant">
                <Markdown text={m.text} />
              </li>
            ),
          )}
          {/* The first poll answers within one request; until then neither shows, so "Thinking…" never precedes the message. */}
          {sentMessage !== null && <UserBubble text={sentMessage.text} />}
          {sentMessage !== null && <li className="bubble assistant thinking">Thinking…</li>}
        </ol>
        {error !== null && <ErrorNote error={error} />}
        {pending.length > 0 && (
          <section className="inline-cards">
            <h3>Waiting on you</h3>
            <ActionGroups actions={pending} helpers={helpers} terms={terms} />
          </section>
        )}
        {outbound.length > 0 && (
          <section className="inline-cards">
            <h3>Messages for you to send</h3>
            <MessageList messages={outbound} helpers={helpers} />
          </section>
        )}
      </div>
      <Composer
        key={sessionId ?? "new"}
        sessionId={sessionId}
        initialText={draft ?? ""}
        disabled={running}
        onStarted={(started) => {
          if (started.sessionId !== sessionId) onSessionStarted(started.sessionId);
          else {
            setStartedTurnId(started.turnId);
            refresh();
          }
        }}
      />
    </div>
  );
}
