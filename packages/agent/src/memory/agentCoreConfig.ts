/**
 * AgentCore Memory settings from the environment, in the shape CDK gives the
 * Agent Lambda (infra constructs/memory.ts agentEnvironment):
 *
 *   AGENTCORE_MEMORY_ID       the memory resource
 *   AGENTCORE_ACTOR_ID        the one actor (the household)
 *   AGENTCORE_HINT_NAMESPACES "SEMANTIC=ns1,PREFERENCE=ns2"; empty = short-term only
 *
 * Neither id set → null (the caller picks in-memory chat history). One without
 * the other, or a malformed namespace list, fails loudly.
 *
 * Call sites: scripts/live/env.ts (CLI, scenarios), apps/local-server
 * (DATA_BACKEND=aws, reading the deployed Agent Lambda's env); from gate I3, the
 * Agent Lambda handler.
 */
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { MemoryStrategySchema } from "@helper-assistant/domain";
import { AgentCoreMemory, agentCoreMemoryApi } from "./agentCoreMemory";
import type { AgentCoreMemoryConfig } from "./agentCoreMemory";

const optional = (env: Record<string, string | undefined>, name: string): string | null => {
  const value = env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
};

export function agentCoreMemoryConfigFromEnv(env: Record<string, string | undefined>): AgentCoreMemoryConfig | null {
  const memoryId = optional(env, "AGENTCORE_MEMORY_ID");
  const actorId = optional(env, "AGENTCORE_ACTOR_ID");
  if ((memoryId === null) !== (actorId === null)) throw new Error("Set both AGENTCORE_MEMORY_ID and AGENTCORE_ACTOR_ID, or neither.");
  if (memoryId === null || actorId === null) return null;
  const hintNamespaces = (optional(env, "AGENTCORE_HINT_NAMESPACES") ?? "")
    .split(",")
    .filter((pair) => pair.trim() !== "")
    .map((pair) => {
      const [strategy, namespace] = pair.split("=").map((s) => s.trim());
      if (strategy === undefined || namespace === undefined || namespace === "") throw new Error(`AGENTCORE_HINT_NAMESPACES entry "${pair}" isn't STRATEGY=namespace`);
      return { strategy: MemoryStrategySchema.parse(strategy), namespace };
    });
  return { memoryId, actorId, hintNamespaces };
}

export const agentCoreMemory = (config: AgentCoreMemoryConfig, region: string): AgentCoreMemory =>
  new AgentCoreMemory(agentCoreMemoryApi(new BedrockAgentCoreClient({ region })), config);
