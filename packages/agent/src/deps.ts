/**
 * What the agent needs, injected. The agent never reads the environment: the
 * CLI, the scenario runner, apps/local-server and (later) the Agent Lambda build
 * this from their own configuration.
 *
 * Call sites: runTurn, LocalTurnRunner, the tool context.
 */
import type { CoreDeps } from "@helper-assistant/core";
import type { BlobStore, MemoryClient, ModelClient } from "@helper-assistant/domain";

export type AgentDeps = CoreDeps & {
  blobStore: BlobStore;
  /** The model for both the agent loop and the quarantined extraction call. */
  model: ModelClient;
  memory: MemoryClient;
};
