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
        <aside className="session-list">
          <a className="button primary" href={hrefFor(routes.chat())}>
            New chat
          </a>
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
        <Conversation sessionId={sessionId} draft={draft} intro={CHAT_INTRO} onSessionStarted={(id) => navigate(routes.chat(id))} />
        <DecidedPanel sessionId={sessionId} />
      </div>
    </section>
  );
}
