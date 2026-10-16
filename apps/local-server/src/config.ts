/**
 * Local server settings. Read once at startup from the repo-root `.env` (see
 * `.env.example`) plus the real environment, which wins. Missing required
 * settings fail before the server starts; nothing has a default.
 *
 * Call site: index.ts.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ModelSettings } from "@helper-assistant/agent";
import type { SeedMode } from "./seed";
import { SEED_MODES } from "./seed";

/** The UI's Vite dev proxy forwards /api here (apps/web/vite.config.ts). */
export const LOCAL_API_PORT = 8787;

const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

export type LocalConfig = { appPassword: string; seedMode: SeedMode; modelSettings: ModelSettings };

export function loadLocalConfig(): LocalConfig {
  // loadEnvFile never overwrites variables already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const appPassword = process.env.APP_PASSWORD?.trim();
  if (appPassword === undefined || appPassword === "") throw new Error("APP_PASSWORD is not set. Add it to .env (see .env.example).");

  const seed = process.env.LOCAL_SEED?.trim();
  const seedMode = SEED_MODES.find((mode) => mode === seed);
  if (seedMode === undefined) throw new Error(`LOCAL_SEED must be one of: ${SEED_MODES.join(", ")} (got "${seed ?? ""}"). See .env.example.`);

  return { appPassword, seedMode, modelSettings: process.env };
}
