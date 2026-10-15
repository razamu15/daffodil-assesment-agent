/**
 * Assistant chat: the chat list on the side, the conversation, and this chat's
 * cards inline. A turn runs in the background (Doc 2 §3 "Chat turn"); the UI
 * polls GET /api/turns/:id every TURN_POLL_INTERVAL_MS until it finishes.
 */
import { useEffect, useState } from "react";
import { ChatRole, PendingActionStatus, TURN_POLL_INTERVAL_MS, TurnStatus } from "@helper-assistant/domain";
import type { AgreementTerm, ChatMessage, Helper, Id, OutboundMessage, PendingAction, Session, TurnStatus as TurnStatusT } from "@helper-assistant/domain";
import { asClientError, useApiQuery, useApp } from "../../app/AppContext";
import { hrefFor, navigate, routes } from "../../app/routes";
import { ErrorNote, Loaded } from "../../ui/common";
import { formatInstant } from "../../ui/format";
import { ActionCard } from "../decisions/ActionCard";
import { ActionGroups } from "../decisions/ActionGroups";
import { MessageList } from "../decisions/MessageList";
import { Composer } from "./Composer";

type ChatData = {
  sessions: Session[];
  messages: ChatMessage[];
  actions: PendingAction[];
  helpers: Helper[];
  terms: AgreementTerm[];
  /** Drafts confirmed from this chat's cards, ready to copy. */
  outbound: OutboundMessage[];
};

const FINISHED_TURN: readonly TurnStatusT[] = [TurnStatus.COMPLETED, TurnStatus.FAILED];

export function ChatScreen({ sessionId, draft }: { sessionId: Id | null; draft: string | null }) {
  const query = useApiQuery(async (api): Promise<ChatData> => {
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
    return { sessions, messages, helpers, terms, actions: mine, outbound: outbound.filter((m) => refs.has(m.createdByActionRef)) };
  }, [sessionId]);
  return (
    <section className="screen chat-screen">
      <Loaded query={query}>{(data) => <ChatView {...data} sessionId={sessionId} draft={draft} />}</Loaded>
    </section>
  );
}

/** Polls a running turn; refreshes the app when it finishes so the reply and its cards appear. */
function useTurnPolling(turnId: Id | null): { running: boolean; error: string | null } {
  const { api, refresh } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [finishedTurnId, setFinishedTurnId] = useState<Id | null>(null);
  useEffect(() => {
    if (turnId === null) return;
    let live = true;
    const poll = async () => {
      try {
        const turn = await api.call("getTurn", { params: { id: turnId } });
        if (!live) return;
        if (FINISHED_TURN.includes(turn.status)) {
          if (turn.status === TurnStatus.FAILED) setError(turn.error ?? "The assistant couldn't finish that. Try again.");
          setFinishedTurnId(turnId);
          refresh();
        } else timer = setTimeout(poll, TURN_POLL_INTERVAL_MS);
      } catch (e) {
        if (live) setError(asClientError(e).message);
      }
    };
    let timer = setTimeout(poll, TURN_POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, turnId]);
  return { running: turnId !== null && turnId !== finishedTurnId && error === null, error };
}

function ChatView({ sessions, messages, actions, helpers, terms, outbound, sessionId, draft }: ChatData & { sessionId: Id | null; draft: string | null }) {
  const { refresh } = useApp();
  const session = sessions.find((s) => s.sessionId === sessionId) ?? null;
  const [startedTurnId, setStartedTurnId] = useState<Id | null>(null);
  const activeTurnId = session?.activeTurnId ?? startedTurnId;
  const { running, error } = useTurnPolling(activeTurnId);
  const pending = actions.filter((a) => a.status === PendingActionStatus.PENDING);
  const resolvedCards = actions.filter((a) => a.status !== PendingActionStatus.PENDING);

  return (
    <div className="chat">
      <aside className="session-list">
        <a className="button primary" href={hrefFor(routes.chat())}>
          New chat
        </a>
        <ul>
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <a href={hrefFor(routes.chat(s.sessionId))} className={s.sessionId === sessionId ? "active" : undefined}>
                <span>{s.title}</span>
                <span className="muted small">{formatInstant(s.lastActiveAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      </aside>
      <div className="conversation">
        {sessionId !== null && session === null && <ErrorNote error="That chat doesn't exist." />}
        {sessionId === null && messages.length === 0 && (
          <div className="chat-intro">
            <h2>Add what you have</h2>
            <p>Paste notes, drop screenshots of texts, or forward a bill. You'll see what the assistant understood next to the original, and nothing is saved until you confirm.</p>
          </div>
        )}
        <ol className="messages">
          {messages.map((m, i) => (
            <li key={`${m.at}-${i}`} className={m.role === ChatRole.USER ? "bubble user" : "bubble assistant"}>
              {m.text}
            </li>
          ))}
          {running && <li className="bubble assistant thinking">Thinking…</li>}
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
        {resolvedCards.length > 0 && (
          <section className="inline-cards resolved">
            <h3>Earlier in this chat</h3>
            {resolvedCards.map((a) => (
              <ActionCard key={a.ref} action={a} helpers={helpers} terms={terms} />
            ))}
          </section>
        )}
        <Composer
          key={sessionId ?? "new"}
          sessionId={sessionId}
          initialText={draft ?? ""}
          disabled={running}
          onStarted={(started) => {
            if (started.sessionId !== sessionId) navigate(routes.chat(started.sessionId));
            else {
              setStartedTurnId(started.turnId);
              refresh();
            }
          }}
        />
      </div>
    </div>
  );
}
