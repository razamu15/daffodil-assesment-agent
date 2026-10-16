/**
 * Everything pinned about a deployment, in one place (Doc 2 §6, "Settings").
 * The region and model are fixed on purpose; the account always comes from the
 * deployer's credentials. The README repeats the region and model.
 *
 * Call sites: bin/app.ts (region, stack name), the stack and its constructs
 * (model, memory), scripts/cleanupLogGroups.ts (region, stack name).
 */

export const DEPLOY_REGION = "us-east-1";

/** Also the prefix of every auto-generated Lambda name, which the log group cleanup relies on. */
export const STACK_NAME = "HelperAssistant";

/** US cross-region inference profile: Converse calls may be served from any region listed below. */
export const MODEL_INFERENCE_PROFILE_ID = "us.anthropic.claude-sonnet-4-6";

/** The foundation model behind the profile. IAM must allow it in every region the profile routes to. */
export const MODEL_FOUNDATION_ID = "anthropic.claude-sonnet-4-6";

/** One household, so one AgentCore actor. */
export const AGENTCORE_ACTOR_ID = "household";

/** How long AgentCore keeps raw chat events (short-term memory). */
export const MEMORY_EVENT_EXPIRY_DAYS = 90;

/**
 * Long-term memory strategies and the namespace each one writes to. The keys are
 * the agent's `MemoryStrategy` values; the Agent Lambda gets these with
 * `{actorId}` filled in (AGENTCORE_HINT_NAMESPACES).
 */
export const MEMORY_STRATEGY_NAMESPACES = {
  SEMANTIC: "/households/{actorId}/semantic",
  PREFERENCE: "/households/{actorId}/preferences",
} as const;
