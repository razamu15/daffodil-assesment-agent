/**
 * Assistant chat: the chat list, the conversation, and on the other side what
 * was already decided in this chat, folded away and read-only (DecidedPanel).
 */
import { useApiQuery } from "../../app/AppContext";
import { hrefFor, navigate, routes } from "../../app/routes";
import type { Id } from "@helper-assistant/domain";
import { Loaded } from "../../ui/common";
import { formatInstant } from "../../ui/format";
import { CHAT_INTRO, Conversation } from "./Conversation";
import { DecidedPanel } from "./DecidedPanel";

export function ChatScreen({ sessionId, draft }: { sessionId: Id | null; draft: string | null }) {
  const sessions = useApiQuery((api) => api.call("listSessions"), []);
  return (
    <section className="screen chat-screen">
      <div className="chat">
        <aside className="panel session-list">
          <header className="panel-head">
            <h2>Chats</h2>
            <a className="button primary small-button" href={hrefFor(routes.chat())}>
              New chat
            </a>
          </header>
          <Loaded query={sessions}>
            {({ sessions: list }) => (
              <ul>
                {list.map((s) => (
                  <li key={s.sessionId}>
                    <a href={hrefFor(routes.chat(s.sessionId))} className={s.sessionId === sessionId ? "active" : undefined}>
                      <span>{s.title}</span>
                      <span className="muted small">{formatInstant(s.lastActiveAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Loaded>
        </aside>
        <section className="panel chat-main">
          <Conversation sessionId={sessionId} draft={draft} intro={CHAT_INTRO} onSessionStarted={(id) => navigate(routes.chat(id))} />
        </section>
        <DecidedPanel sessionId={sessionId} />
      </div>
    </section>
  );
}
