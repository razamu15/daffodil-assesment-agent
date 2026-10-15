/**
 * What core's stateful functions need. Injected so core never reads the
 * environment: api's createApp and the agent's tool context both build one.
 */
import type { Clock, Id, Store } from "@helper-assistant/domain";

export type CoreDeps = {
  store: Store;
  clock: Clock;
  /** New record ids (terms, bills, lines, messages, …). crypto.randomUUID in production; counters in tests. */
  newId: () => Id;
};
