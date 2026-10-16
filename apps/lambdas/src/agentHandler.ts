/**
 * The Agent Lambda: one chat turn per async invoke (from LambdaTurnRunner).
 * runTurn records its own failures on the Turn; anything thrown before that
 * (the turn can't be loaded or marked RUNNING) fails the invoke, which is
 * logged and never retried.
 *
 * Model settings come from the env CDK sets (constructs/agent.ts):
 *   MODEL_PROVIDER=bedrock    BEDROCK_MODEL_ID (+ AWS_REGION, set by Lambda)
 *   MODEL_PROVIDER=anthropic  ANTHROPIC_MODEL_ID, and the API key read once per
 *                             cold start from the Secrets Manager secret named
 *                             by ANTHROPIC_API_KEY_SECRET_ARN (JSON {"api_key"}).
 *                             The key is never in the Lambda's environment.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { modelFromSettings, ModelProvider, runTurn } from "@helper-assistant/agent";
import type { AgentDeps, ModelSettings } from "@helper-assistant/agent";
import { z } from "zod";
import { requiredEnv, sharedRuntime } from "./runtime";
import { TurnInvocationSchema } from "./turnInvocation";

/** The secret's shape, set by infra constructs/agent.ts. */
const ApiKeySecretSchema = z.object({ api_key: z.string().min(1) });

async function modelSettings(): Promise<ModelSettings> {
  if (requiredEnv("MODEL_PROVIDER") !== ModelProvider.ANTHROPIC) return process.env;
  const secrets = new SecretsManagerClient({ region: requiredEnv("AWS_REGION") });
  const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: requiredEnv("ANTHROPIC_API_KEY_SECRET_ARN") }));
  const { api_key } = ApiKeySecretSchema.parse(JSON.parse(SecretString ?? "null"));
  return { ...process.env, ANTHROPIC_API_KEY: api_key };
}

async function buildDeps(): Promise<AgentDeps> {
  const { model, description } = modelFromSettings(await modelSettings());
  console.log(JSON.stringify({ msg: "agent cold start", model: description }));
  return { ...sharedRuntime(), model };
}

/** Built on the first invoke and reused while the container lives. A failed build is retried next invoke. */
let deps: Promise<AgentDeps> | null = null;

export async function handler(event: unknown): Promise<void> {
  const turn = TurnInvocationSchema.parse(event);
  deps ??= buildDeps().catch((error: unknown) => {
    deps = null;
    throw error;
  });
  try {
    const finished = await runTurn(turn, await deps);
    console.log(JSON.stringify({ msg: "turn finished", turnId: turn.turnId, status: finished.status }));
  } catch (error) {
    console.error(JSON.stringify({ msg: "turn failed before it could record the failure", ...turn, error: String(error) }));
    throw error;
  }
}
