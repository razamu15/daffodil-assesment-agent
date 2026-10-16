/**
 * Local dev server (gate I1): createApp from api, with the in-memory store,
 * blob store and chat memory, LocalTurnRunner running the agent in-process,
 * the system clock, and the model picked by MODEL_PROVIDER (Claude API or
 * Bedrock). Nothing touches the deployed stack. Everything resets on restart.
 *
 * Run: npm run dev -w @helper-assistant/local-server
 */
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { InMemoryMemory, LocalTurnRunner, modelFromSettings } from "@helper-assistant/agent";
import { createApp } from "@helper-assistant/api";
import { SystemClock } from "@helper-assistant/domain";
import { InMemoryBlobStore, InMemoryStore } from "@helper-assistant/store";
import { LOCAL_API_PORT, loadLocalConfig } from "./config";
import { seed } from "./seed";

const config = loadLocalConfig();
const { model, description: modelDescription } = modelFromSettings(config.modelSettings);

const shared = {
  store: new InMemoryStore(),
  blobStore: new InMemoryBlobStore(),
  clock: new SystemClock(),
  memory: new InMemoryMemory(),
  newId: () => randomUUID(),
};
await seed(config.seedMode, shared);

const turnRunner = new LocalTurnRunner({ ...shared, model }, (turn, error) => {
  console.error(`turn ${turn.turnId} (session ${turn.sessionId}) failed before it could record the failure:`, error);
});
const app = createApp({ ...shared, appPassword: config.appPassword, turnRunner });

serve({ fetch: app.fetch, port: LOCAL_API_PORT }, ({ port }) => {
  console.log(`Local API on http://localhost:${port}/api. Model: ${modelDescription}. Seed: ${config.seedMode}. Today: ${shared.clock.today()}.`);
});
