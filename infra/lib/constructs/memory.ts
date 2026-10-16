/**
 * AgentCore Memory with the two long-term strategies (semantic facts and user
 * preferences). The namespace strings come from deployConfig and nowhere else,
 * so the strategies and the agent's hint search can't drift apart (Doc 2 §6,
 * "Cross-chat memory").
 */
import { CfnMemory } from "aws-cdk-lib/aws-bedrockagentcore";
import { Construct } from "constructs";
import { AGENTCORE_ACTOR_ID, MEMORY_EVENT_EXPIRY_DAYS, MEMORY_STRATEGY_NAMESPACES, STACK_NAME } from "../deployConfig";

export class Memory extends Construct {
  readonly memory: CfnMemory;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.memory = new CfnMemory(this, "Memory", {
      name: `${STACK_NAME}Memory`,
      description: "Chat history and long-term hints for the helper assistant",
      eventExpiryDuration: MEMORY_EVENT_EXPIRY_DAYS,
      memoryStrategies: [
        { semanticMemoryStrategy: { name: "HouseholdFacts", namespaces: [MEMORY_STRATEGY_NAMESPACES.SEMANTIC] } },
        { userPreferenceMemoryStrategy: { name: "HouseholdPreferences", namespaces: [MEMORY_STRATEGY_NAMESPACES.PREFERENCE] } },
      ],
    });
  }

  /**
   * Env vars the agent's AgentCoreMemory wiring reads. The hint namespaces use the
   * `STRATEGY=namespace,...` format that packages/agent/scripts/live/env.ts parses.
   */
  agentEnvironment(): Record<string, string> {
    const hintNamespaces = Object.entries(MEMORY_STRATEGY_NAMESPACES)
      .map(([strategy, template]) => `${strategy}=${template.replace("{actorId}", AGENTCORE_ACTOR_ID)}`)
      .join(",");
    return {
      AGENTCORE_MEMORY_ID: this.memory.attrMemoryId,
      AGENTCORE_ACTOR_ID,
      AGENTCORE_HINT_NAMESPACES: hintNamespaces,
    };
  }
}
