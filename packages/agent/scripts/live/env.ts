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
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { MemoryStrategySchema } from "@helper-assistant/domain";
import type { MemoryClient, ModelClient } from "@helper-assistant/domain";
import { AgentCoreMemory, agentCoreMemoryApi, InMemoryMemory, modelFromSettings } from "../../src/index";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set; there is no default. See .env.example.`);
  }
  return value.trim();
}

const optional = (name: string): string | null => {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
};

export type LiveServices = { model: ModelClient; memory: MemoryClient; description: string };

export function liveServicesFromEnv(): LiveServices {
  const { model, description: modelDescription } = modelFromSettings(process.env);

  const memoryId = optional("AGENTCORE_MEMORY_ID");
  const actorId = optional("AGENTCORE_ACTOR_ID");
  if ((memoryId === null) !== (actorId === null)) throw new Error("Set both AGENTCORE_MEMORY_ID and AGENTCORE_ACTOR_ID, or neither.");
  if (memoryId === null || actorId === null) {
    return { model, memory: new InMemoryMemory(), description: `${modelDescription}; in-memory chat history` };
  }
  const region = required("AWS_REGION");
  const hintNamespaces = (optional("AGENTCORE_HINT_NAMESPACES") ?? "")
    .split(",")
    .filter((pair) => pair.trim() !== "")
    .map((pair) => {
      const [strategy, namespace] = pair.split("=").map((s) => s.trim());
      if (strategy === undefined || namespace === undefined || namespace === "") throw new Error(`AGENTCORE_HINT_NAMESPACES entry "${pair}" isn't STRATEGY=namespace`);
      return { strategy: MemoryStrategySchema.parse(strategy), namespace };
    });
  const memory = new AgentCoreMemory(agentCoreMemoryApi(new BedrockAgentCoreClient({ region })), { memoryId, actorId, hintNamespaces });
  return { model, memory, description: `${modelDescription}; AgentCore memory ${memoryId} in ${region}` };
}
