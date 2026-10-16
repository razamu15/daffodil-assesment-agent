/**
 * The async-invoke payload from the API Lambda to the Agent Lambda: just the
 * turn's identity. The turn's input is already stored on the Turn record.
 *
 * Call sites: lambdaTurnRunner.ts (writes it), agentHandler.ts (parses it at
 * the boundary).
 */
import { IdSchema } from "@helper-assistant/domain";
import { z } from "zod";

export const TurnInvocationSchema = z.object({ turnId: IdSchema, sessionId: IdSchema });
export type TurnInvocation = z.infer<typeof TurnInvocationSchema>;
