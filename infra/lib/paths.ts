/**
 * Absolute paths the CDK app needs, resolved from this file so they work from
 * any working directory (cdk, vitest, scripts).
 *
 * Call sites: bin/app.ts (handler entries, web build), constructs/nodeFunction.ts.
 */
import { fileURLToPath } from "node:url";

export const INFRA_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

/** Track D stubs. I3 points these at thin wrappers around createApp and runTurn. */
export const API_HANDLER_ENTRY = `${INFRA_ROOT}/lambda/apiStub.ts`;
export const AGENT_HANDLER_ENTRY = `${INFRA_ROOT}/lambda/agentStub.ts`;

/** `npm run build -w @helper-assistant/web` output. The deploy script builds it first. */
export const WEB_DIST = `${REPO_ROOT}/apps/web/dist`;
