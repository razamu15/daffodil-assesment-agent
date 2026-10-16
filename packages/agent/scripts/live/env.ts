/**
 * Live wiring for the CLI and the scenario runner: the real model picked by
 * MODEL_PROVIDER (model/modelProvider.ts), and AgentCoreMemory when its settings
 * are given. Settings come from the environment; a missing required one fails
 * loudly before anything calls a model. Nothing has a default model or region.
 *
 *   MODEL_PROVIDER + its settings  required. See model/modelProvider.ts and .env.example.
 *   AWS_REGION                region for AgentCore (required with AGENTCORE_MEMORY_ID).
 *   AGENTCORE_MEMORY_ID       optional. With AGENTCORE_ACTOR_ID, use AgentCore Memory
 *   AGENTCORE_ACTOR_ID        instead of InMemoryMemory.
 *   AGENTCORE_HINT_NAMESPACES optional. "PREFERENCE=ns1,SEMANTIC=ns2"; empty = short-term only.
 *
 * Credentials come from the default AWS provider chain (profile, env, SSO).
 *
 * Call sites: scripts/cli.ts, scripts/scenarios.ts.
 */
import type { MemoryClient, ModelClient } from "@helper-assistant/domain";
import { agentCoreMemory, agentCoreMemoryConfigFromEnv, InMemoryMemory, modelFromSettings } from "../../src/index";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set; there is no default. See .env.example.`);
  }
  return value.trim();
}

export type LiveServices = { model: ModelClient; memory: MemoryClient; description: string };

export function liveServicesFromEnv(): LiveServices {
  const { model, description: modelDescription } = modelFromSettings(process.env);
  const memoryConfig = agentCoreMemoryConfigFromEnv(process.env);
  if (memoryConfig === null) return { model, memory: new InMemoryMemory(), description: `${modelDescription}; in-memory chat history` };
  const region = required("AWS_REGION");
  return { model, memory: agentCoreMemory(memoryConfig, region), description: `${modelDescription}; AgentCore memory ${memoryConfig.memoryId} in ${region}` };
}
