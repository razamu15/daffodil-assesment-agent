/**
 * Live wiring for the CLI and the scenario runner: the real BedrockModel from
 * the environment, and AgentCoreMemory when its settings are given. Every
 * setting is read here and nowhere else; a missing required one fails loudly
 * before anything calls AWS. Nothing has a default model, region or account.
 *
 *   BEDROCK_MODEL_ID          required. Model ID or inference profile ID.
 *   AWS_REGION                required. Region for Bedrock (and AgentCore).
 *   AGENTCORE_MEMORY_ID       optional. With AGENTCORE_ACTOR_ID, use AgentCore Memory
 *   AGENTCORE_ACTOR_ID        instead of InMemoryMemory.
 *   AGENTCORE_HINT_NAMESPACES optional. "PREFERENCE=ns1,SEMANTIC=ns2"; empty = short-term only.
 *
 * Credentials come from the default AWS provider chain (profile, env, SSO).
 *
 * Call sites: scripts/cli.ts, scripts/scenarios.ts.
 */
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { MemoryStrategySchema } from "@helper-assistant/domain";
import type { MemoryClient, ModelClient } from "@helper-assistant/domain";
import { AgentCoreMemory, agentCoreMemoryApi, BedrockModel, bedrockConverseApi, InMemoryMemory } from "../../src/index";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set. The live runners need BEDROCK_MODEL_ID and AWS_REGION (and AWS credentials); there are no defaults.`);
  }
  return value.trim();
}

const optional = (name: string): string | null => {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
};

export type LiveServices = { model: ModelClient; memory: MemoryClient; description: string };

export function liveServicesFromEnv(): LiveServices {
  const modelId = required("BEDROCK_MODEL_ID");
  const region = required("AWS_REGION");
  const model = new BedrockModel(bedrockConverseApi(new BedrockRuntimeClient({ region })), modelId);

  const memoryId = optional("AGENTCORE_MEMORY_ID");
  const actorId = optional("AGENTCORE_ACTOR_ID");
  if ((memoryId === null) !== (actorId === null)) throw new Error("Set both AGENTCORE_MEMORY_ID and AGENTCORE_ACTOR_ID, or neither.");
  if (memoryId === null || actorId === null) {
    return { model, memory: new InMemoryMemory(), description: `Bedrock ${modelId} in ${region}; in-memory chat history` };
  }
  const hintNamespaces = (optional("AGENTCORE_HINT_NAMESPACES") ?? "")
    .split(",")
    .filter((pair) => pair.trim() !== "")
    .map((pair) => {
      const [strategy, namespace] = pair.split("=").map((s) => s.trim());
      if (strategy === undefined || namespace === undefined || namespace === "") throw new Error(`AGENTCORE_HINT_NAMESPACES entry "${pair}" isn't STRATEGY=namespace`);
      return { strategy: MemoryStrategySchema.parse(strategy), namespace };
    });
  const memory = new AgentCoreMemory(agentCoreMemoryApi(new BedrockAgentCoreClient({ region })), { memoryId, actorId, hintNamespaces });
  return { model, memory, description: `Bedrock ${modelId} in ${region}; AgentCore memory ${memoryId}` };
}
