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
import { SEED_MODES, SeedMode } from "./seed";

/** The UI's Vite dev proxy forwards /api here (apps/web/vite.config.ts). */
export const LOCAL_API_PORT = 8787;

const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

/** Where the local server keeps data and chat memory. */
export const DataBackend = {
  /** In-process fakes (gate I1). Everything resets on restart. */
  MEMORY: "memory",
  /** The deployed stack's DynamoDB tables, uploads bucket and AgentCore Memory (gate I2). */
  AWS: "aws",
} as const;
export type DataBackend = (typeof DataBackend)[keyof typeof DataBackend];
const DATA_BACKENDS: readonly DataBackend[] = Object.values(DataBackend);

export type LocalConfig = { appPassword: string; dataBackend: DataBackend; seedMode: SeedMode; modelSettings: ModelSettings };

export function loadLocalConfig(): LocalConfig {
  // loadEnvFile never overwrites variables already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const appPassword = process.env.APP_PASSWORD?.trim();
  if (appPassword === undefined || appPassword === "") throw new Error("APP_PASSWORD is not set. Add it to .env (see .env.example).");

  const seed = process.env.LOCAL_SEED?.trim();
  const seedMode = SEED_MODES.find((mode) => mode === seed);
  if (seedMode === undefined) throw new Error(`LOCAL_SEED must be one of: ${SEED_MODES.join(", ")} (got "${seed ?? ""}"). See .env.example.`);

  const backend = process.env.DATA_BACKEND?.trim();
  const dataBackend = DATA_BACKENDS.find((b) => b === backend);
  if (dataBackend === undefined) throw new Error(`DATA_BACKEND must be one of: ${DATA_BACKENDS.join(", ")} (got "${backend ?? ""}"). See .env.example.`);
  // Seeding writes fixed ids with create-only conditions: it works once on fresh
  // fakes, but would fail against tables that already hold them.
  if (dataBackend === DataBackend.AWS && seedMode !== SeedMode.EMPTY) {
    throw new Error(`LOCAL_SEED must be "${SeedMode.EMPTY}" with DATA_BACKEND=aws. To start over, run: npm run reset-aws-data -w @helper-assistant/local-server -- --yes`);
  }

  return { appPassword, dataBackend, seedMode, modelSettings: process.env };
}
