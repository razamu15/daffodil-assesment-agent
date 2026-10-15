/**
 * @helper-assistant/api: createApp(deps), the Hono app implementing domain's
 * apiRoutes with token auth. Runtime-agnostic: served by apps/local-server
 * locally and wrapped with hono/aws-lambda in the API Lambda (gate I3, where
 * LambdaTurnRunner is added here too).
 */
export { createApp } from "./app";
export type { AppDeps } from "./deps";
export { CORE_ERROR_API_CODE, STORE_FAILURE_API_CODE } from "./errors";
