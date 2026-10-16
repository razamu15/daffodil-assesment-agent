/**
 * LambdaTurnRunner: the real TurnRunner (Doc 4 §2 seam). start() invokes the
 * Agent Lambda asynchronously (InvocationType Event) and returns once Lambda has
 * queued it, like LocalTurnRunner returning before runTurn finishes. The UI
 * polls the Turn. The Agent Lambda has no async retries, so a turn never runs twice.
 *
 * Call site: apiHandler.ts.
 */
import { InvokeCommand } from "@aws-sdk/client-lambda";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import type { TurnRunner } from "@helper-assistant/domain";
import type { TurnInvocation } from "./turnInvocation";

/** Lambda's answer to an accepted async invoke. */
const ASYNC_INVOKE_ACCEPTED = 202;

export class LambdaTurnRunner implements TurnRunner {
  constructor(
    private readonly lambda: Pick<LambdaClient, "send">,
    private readonly agentFunctionName: string,
  ) {}

  async start(turn: TurnInvocation): Promise<void> {
    const payload: TurnInvocation = { turnId: turn.turnId, sessionId: turn.sessionId };
    const { StatusCode } = await this.lambda.send(
      new InvokeCommand({ FunctionName: this.agentFunctionName, InvocationType: "Event", Payload: new TextEncoder().encode(JSON.stringify(payload)) }),
    );
    if (StatusCode !== ASYNC_INVOKE_ACCEPTED) throw new Error(`Agent Lambda didn't accept turn ${turn.turnId} (status ${StatusCode})`);
  }
}
