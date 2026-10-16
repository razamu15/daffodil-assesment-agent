import { describe, expect, it } from "vitest";
import type { InvokeCommand } from "@aws-sdk/client-lambda";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { LambdaTurnRunner } from "../src/lambdaTurnRunner";
import { TurnInvocationSchema } from "../src/turnInvocation";

const fakeLambda = (statusCode: number) => {
  const sent: InvokeCommand[] = [];
  const lambda = { send: async (command: InvokeCommand) => (sent.push(command), { StatusCode: statusCode }) } as unknown as Pick<LambdaClient, "send">;
  return { lambda, sent };
};

describe("LambdaTurnRunner", () => {
  it("async-invokes the agent with a payload the agent handler accepts", async () => {
    const { lambda, sent } = fakeLambda(202);
    await new LambdaTurnRunner(lambda, "agent-fn").start({ turnId: "turn-1", sessionId: "session-1" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.input).toMatchObject({ FunctionName: "agent-fn", InvocationType: "Event" });
    const payload: unknown = JSON.parse(new TextDecoder().decode(sent[0]!.input.Payload as Uint8Array));
    expect(TurnInvocationSchema.parse(payload)).toEqual({ turnId: "turn-1", sessionId: "session-1" });
  });

  it("fails loudly when Lambda doesn't accept the invoke", async () => {
    const { lambda } = fakeLambda(500);
    await expect(new LambdaTurnRunner(lambda, "agent-fn").start({ turnId: "turn-1", sessionId: "session-1" })).rejects.toThrow(/didn't accept/);
  });
});
