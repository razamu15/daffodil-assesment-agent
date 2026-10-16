/**
 * The API Lambda: createApp behind API Gateway's HTTP API (payload v2), through
 * Hono's Lambda adapter. Agent turns start by async invoke of the Agent Lambda.
 *
 * Env (infra constructs/api.ts): APP_PASSWORD, AGENT_FUNCTION_NAME, the data
 * and memory settings read by runtime.ts.
 */
import { LambdaClient } from "@aws-sdk/client-lambda";
import { createApp } from "@helper-assistant/api";
import { handle } from "hono/aws-lambda";
import { LambdaTurnRunner } from "./lambdaTurnRunner";
import { requiredEnv, sharedRuntime } from "./runtime";

const runtime = sharedRuntime();
const app = createApp({
  ...runtime,
  appPassword: requiredEnv("APP_PASSWORD"),
  turnRunner: new LambdaTurnRunner(new LambdaClient({ region: requiredEnv("AWS_REGION") }), requiredEnv("AGENT_FUNCTION_NAME")),
});

export const handler = handle(app);
