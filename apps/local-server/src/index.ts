/**
 * Local dev server: createApp from api, LocalTurnRunner running the agent
 * in-process, the system clock, and the model picked by MODEL_PROVIDER (Claude
 * API or Bedrock). DATA_BACKEND picks where data and chat memory live:
 *   memory  in-process fakes (gate I1); everything resets on restart.
 *   aws     the deployed stack's DynamoDB tables, uploads bucket and AgentCore
 *           Memory (gate I2), found through deployedStack.ts. Data persists.
 *
 * Run: npm run dev -w @helper-assistant/local-server
 */
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { agentCoreMemory, InMemoryMemory, LocalTurnRunner, modelFromSettings } from "@helper-assistant/agent";
import { createApp } from "@helper-assistant/api";
import { SystemClock } from "@helper-assistant/domain";
import type { BlobStore, MemoryClient, Store } from "@helper-assistant/domain";
import { awsDataServices, InMemoryBlobStore, InMemoryStore } from "@helper-assistant/store";
import { DataBackend, LOCAL_API_PORT, loadLocalConfig } from "./config";
import type { DataBackend as DataBackendT } from "./config";
import { DEPLOYED_REGION, DEPLOYED_STACK_NAME, deployedResources } from "./deployedStack";
import { seed } from "./seed";

type DataServices = { store: Store; blobStore: BlobStore; memory: MemoryClient; description: string };

const DATA_SERVICES: Record<DataBackendT, () => Promise<DataServices>> = {
  [DataBackend.MEMORY]: async () => ({
    store: new InMemoryStore(),
    blobStore: new InMemoryBlobStore(),
    memory: new InMemoryMemory(),
    description: "in-memory data (resets on restart)",
  }),
  [DataBackend.AWS]: async () => {
    const resources = await deployedResources();
    return {
      ...awsDataServices(resources.data),
      memory: agentCoreMemory(resources.memory, DEPLOYED_REGION),
      description: `stack ${DEPLOYED_STACK_NAME} data in ${DEPLOYED_REGION} (DynamoDB, S3, AgentCore memory ${resources.memory.memoryId})`,
    };
  },
};

const config = loadLocalConfig();
const { model, description: modelDescription } = modelFromSettings(config.modelSettings);
const { description: dataDescription, ...data } = await DATA_SERVICES[config.dataBackend]();

const shared = { ...data, clock: new SystemClock(), newId: () => randomUUID() };
await seed(config.seedMode, shared);

const turnRunner = new LocalTurnRunner({ ...shared, model }, (turn, error) => {
  console.error(`turn ${turn.turnId} (session ${turn.sessionId}) failed before it could record the failure:`, error);
});
const app = createApp({ ...shared, appPassword: config.appPassword, turnRunner });

serve({ fetch: app.fetch, port: LOCAL_API_PORT }, ({ port }) => {
  console.log(`Local API on http://localhost:${port}/api. Model: ${modelDescription}. Data: ${dataDescription}. Seed: ${config.seedMode}. Today: ${shared.clock.today()}.`);
});
