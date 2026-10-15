/**
 * Everything createApp needs, injected. No environment reads happen inside the
 * api: apps/local-server and the Lambda handler build this from their own config.
 */
import type { BlobStore, Clock, Id, MemoryClient, Store, TurnRunner } from "@helper-assistant/domain";

export type AppDeps = {
  /** The deploy-time password (APP_PASSWORD). Must be non-empty: there is no insecure default. */
  appPassword: string;
  store: Store;
  blobStore: BlobStore;
  clock: Clock;
  turnRunner: TurnRunner;
  memory: MemoryClient;
  /** New record ids. crypto.randomUUID in production. */
  newId: () => Id;
};
