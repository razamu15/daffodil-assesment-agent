/**
 * Absolute paths the CDK app needs, resolved from this file so they work from
 * any working directory (cdk, vitest, scripts).
 *
 * Call sites: bin/app.ts (handler entries, web build), constructs/nodeFunction.ts.
 */
import { fileURLToPath } from "node:url";

export const INFRA_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

/** The Lambda handlers (gate I3): thin wrappers around createApp and runTurn. */
export const API_HANDLER_ENTRY = `${REPO_ROOT}/apps/lambdas/src/apiHandler.ts`;
export const AGENT_HANDLER_ENTRY = `${REPO_ROOT}/apps/lambdas/src/agentHandler.ts`;

/** `npm run build -w @helper-assistant/web` output. The deploy script builds it first. */
export const WEB_DIST = `${REPO_ROOT}/apps/web/dist`;
