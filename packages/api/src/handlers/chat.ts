/**
 * Chat routes. POST /api/chat only takes the session lock, creates the Turn and
 * hands it to the TurnRunner; the agent runs elsewhere and the UI polls
 * GET /api/turns/:id. Chat history comes from the MemoryClient, not the Store.
 *
 * Call site: createApp.
 */
import { ApiErrorCode } from "@helper-assistant/domain";
import type { PendingAction } from "@helper-assistant/domain";
import { failTurnDispatch, startTurn } from "@helper-assistant/core";
import type { AppDeps } from "../deps";
import { ApiFailure } from "../errors";
import type { RouteHandlers } from "../routing";

/** How much history GET /api/sessions/:id/messages returns. */
export const SESSION_HISTORY_MAX_MESSAGES = 200;

export function chatHandlers(deps: AppDeps) {
  const { store, turnRunner, memory } = deps;
  return {
    chat: async ({ body }) => {
      const { turn } = await startTurn(deps, body);
      try {
        await turnRunner.start({ turnId: turn.turnId, sessionId: turn.sessionId });
      } catch (error) {
        await failTurnDispatch(deps, turn.turnId, `The assistant couldn't be started: ${String(error)}`);
        throw error;
      }
      return { sessionId: turn.sessionId, turnId: turn.turnId };
    },

    getTurn: async ({ params }) => {
      const turn = await store.getTurn(params.id);
      if (turn === null) throw new ApiFailure(ApiErrorCode.NOT_FOUND, `Turn ${params.id} not found`);
      const proposedActions = await Promise.all(
        turn.proposedActionRefs.map(async (ref): Promise<PendingAction> => {
          const action = await store.getAction(ref);
          if (action === null) throw new Error(`Action #${ref} proposed by turn ${turn.turnId} is missing`);
          return action;
        }),
      );
      return { turnId: turn.turnId, sessionId: turn.sessionId, status: turn.status, replyText: turn.replyText, proposedActions, error: turn.error };
    },

    listSessions: async () => ({ sessions: await store.listSessions() }),

    getSessionMessages: async ({ params }) => {
      if ((await store.getSession(params.id)) === null) throw new ApiFailure(ApiErrorCode.NOT_FOUND, `Session ${params.id} not found`);
      return { messages: await memory.listChatMessages(params.id, { maxMessages: SESSION_HISTORY_MAX_MESSAGES }) };
    },
  } satisfies Partial<RouteHandlers>;
}
