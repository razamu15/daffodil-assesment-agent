/**
 * Login, health, chat and turn polling. A turn completes ~1.5s after it starts
 * (real time), so the UI's polling and "thinking" state are visible.
 */
import { AUTH_TOKEN_TTL_HOURS, ApiErrorCode, ChatRole, TurnStatus } from "@helper-assistant/domain";
import type { Session } from "@helper-assistant/domain";
import { scriptedReply } from "../chatScript";
import { MockApiError } from "../errors";
import type { MockWorld } from "../world";
import { MOCK_TOKEN, MOCK_WRONG_PASSWORD } from "./types";
import type { Handlers } from "./types";

type ChatRoutes = "login" | "health" | "chat" | "getTurn";

const TURN_DURATION_MS = 1500;
const TITLE_LENGTH = 48;

function sessionFor(world: MockWorld, sessionId: string | null, text: string): Session {
  if (sessionId !== null) return world.session(sessionId);
  const at = world.now();
  const title = text.trim() === "" ? "Documents" : text.trim().slice(0, TITLE_LENGTH);
  const session: Session = { sessionId: world.newId("session"), title, createdAt: at, lastActiveAt: at, activeTurnId: null, version: 1 };
  world.sessions.push(session);
  world.chat.set(session.sessionId, []);
  return session;
}

export const chatHandlers: Pick<Handlers, ChatRoutes> = {
  login: (world, { body }) => {
    if (body.password === MOCK_WRONG_PASSWORD) throw new MockApiError(ApiErrorCode.UNAUTHORIZED, "That password isn't right.");
    return { token: MOCK_TOKEN, expiresAt: new Date(Date.parse(world.now()) + AUTH_TOKEN_TTL_HOURS * 3_600_000).toISOString() };
  },

  health: () => ({ ok: true }),

  chat: (world, { body }) => {
    const session = sessionFor(world, body.sessionId, body.text);
    if (session.activeTurnId !== null) throw new MockApiError(ApiErrorCode.SESSION_BUSY, "The assistant is still answering in this chat.");
    const turnId = world.newId("turn");
    const at = world.now();
    world.chat.get(session.sessionId)!.push({ role: ChatRole.USER, text: body.text, at });
    world.replace(world.sessions, (s) => s.sessionId === session.sessionId, { ...session, activeTurnId: turnId, lastActiveAt: at, version: session.version + 1 });
    world.turns.set(turnId, {
      view: { turnId, sessionId: session.sessionId, status: TurnStatus.QUEUED, replyText: null, proposedActions: [], error: null },
      readyAtMs: Date.now() + TURN_DURATION_MS,
      input: { text: body.text, attachmentDocIds: body.attachmentDocIds },
    });
    return { sessionId: session.sessionId, turnId };
  },

  getTurn: (world, { params }) => {
    const turn = world.turns.get(params.id);
    if (turn === undefined) throw new MockApiError(ApiErrorCode.NOT_FOUND, `Turn ${params.id} not found.`);
    if (turn.view.status === TurnStatus.COMPLETED) return turn.view;
    if (Date.now() < turn.readyAtMs) {
      turn.view = { ...turn.view, status: TurnStatus.RUNNING };
      return turn.view;
    }
    const { sessionId, turnId } = turn.view;
    const reply = scriptedReply(world, turn.input, { sessionId, turnId, docId: turn.input.attachmentDocIds[0] ?? null });
    const at = world.now();
    world.chat.get(sessionId)!.push({ role: ChatRole.ASSISTANT, text: reply.replyText, at });
    const session = world.session(sessionId);
    world.replace(world.sessions, (s) => s.sessionId === sessionId, { ...session, activeTurnId: null, lastActiveAt: at, version: session.version + 1 });
    turn.view = { ...turn.view, status: TurnStatus.COMPLETED, replyText: reply.replyText, proposedActions: reply.proposed };
    return turn.view;
  },
};
