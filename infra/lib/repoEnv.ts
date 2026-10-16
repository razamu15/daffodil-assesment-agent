/**
 * Reads the repo-root `.env` (the same file apps/local-server uses) into
 * process.env, if it exists. Variables already set in the shell win.
 *
 * Call sites: scripts/deploy.ts, bin/app.ts.
 */
import { existsSync } from "node:fs";
import { REPO_ROOT } from "./paths";

export function loadRepoEnv(): void {
  const file = `${REPO_ROOT}/.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}
