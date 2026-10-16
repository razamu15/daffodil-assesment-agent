/**
 * What both Lambdas build once per cold start, from the environment CDK gives
 * them (infra constructs Agent and Api): the DynamoDB store, the S3 blob store,
 * AgentCore Memory and the clock. A missing variable fails the cold start loudly.
 *
 * AWS_REGION is set by Lambda itself.
 *
 * Call sites: apiHandler.ts, agentHandler.ts.
 */
import { randomUUID } from "node:crypto";
import { agentCoreMemory, agentCoreMemoryConfigFromEnv } from "@helper-assistant/agent";
import { SystemClock } from "@helper-assistant/domain";
import type { BlobStore, Clock, Id, MemoryClient, Store } from "@helper-assistant/domain";
import { awsDataConfigFromEnv, awsDataServices } from "@helper-assistant/store";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is not set on this Lambda`);
  return value.trim();
}

export type SharedRuntime = { store: Store; blobStore: BlobStore; memory: MemoryClient; clock: Clock; newId: () => Id };

export function sharedRuntime(): SharedRuntime {
  const region = requiredEnv("AWS_REGION");
  const memoryConfig = agentCoreMemoryConfigFromEnv(process.env);
  if (memoryConfig === null) throw new Error("AGENTCORE_MEMORY_ID and AGENTCORE_ACTOR_ID are not set on this Lambda");
  return {
    ...awsDataServices(awsDataConfigFromEnv(process.env, region)),
    memory: agentCoreMemory(memoryConfig, region),
    // The runtime's time zone, by decision (Doc 2 §6). On Lambda that is UTC.
    clock: new SystemClock(),
    newId: () => randomUUID(),
  };
}
