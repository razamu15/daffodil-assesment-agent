/**
 * Starter-pack seeding for the live runners. Documents always (with the real
 * screenshot bytes, so the model reads the actual images); with FULL, also the
 * helpers, confirmed terms and the three September bills, recorded and checked,
 * as the app stands on Oct 14 once Jordan has confirmed the agreements.
 *
 * Call sites: scripts/cli.ts, scripts/scenarios.
 */
import { checkStoredBill } from "@helper-assistant/core";
import { DocumentStorage, FixedClock, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { BlobStore, StoreRecord } from "@helper-assistant/domain";
import {
  STARTER_PACK_TODAY,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "@helper-assistant/fixtures";
import { readStarterPackFile } from "@helper-assistant/fixtures/node";
import { InMemoryBlobStore, InMemoryStore } from "@helper-assistant/store";
import type { AgentDeps } from "../../src/index";
import type { LiveServices } from "./env";

export const SeedMode = {
  /** Documents only: the assistant learns helpers and terms from them. */
  DOCUMENTS: "documents",
  /** Documents, helpers, confirmed terms and the September bills (checked). */
  FULL: "full",
} as const;
export type SeedMode = (typeof SeedMode)[keyof typeof SeedMode];

export function counterIds(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export async function seededDeps(services: LiveServices, mode: SeedMode, today = STARTER_PACK_TODAY): Promise<AgentDeps & { store: InMemoryStore }> {
  const store = new InMemoryStore();
  const blobStore = new InMemoryBlobStore();
  const deps = { store, blobStore, clock: FixedClock.onDate(today), newId: counterIds("id"), model: services.model, memory: services.memory };
  await seedDocuments(store, blobStore);
  if (mode === SeedMode.FULL) {
    const records: StoreRecord[] = [
      ...starterPackHelpers.map((value): StoreRecord => ({ entity: StoredEntity.HELPER, value })),
      ...starterPackTerms.map((value): StoreRecord => ({ entity: StoredEntity.TERM, value })),
    ];
    await store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
    for (const bill of starterPackBills) {
      const checked = { ...bill, latestCheck: await checkStoredBill(deps, bill) };
      await store.commit([{ record: { entity: StoredEntity.BILL, value: checked }, condition: { kind: WriteConditionKind.ABSENT } }]);
    }
  }
  return deps;
}

async function seedDocuments(store: InMemoryStore, blobStore: BlobStore): Promise<void> {
  const records: StoreRecord[] = [
    { entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold },
    ...starterPackDocuments.map((value): StoreRecord => ({ entity: StoredEntity.DOCUMENT, value })),
  ];
  await store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  for (const document of starterPackDocuments) {
    if (document.content.storage === DocumentStorage.BLOB) {
      await blobStore.put(document.content.blobKey, await readStarterPackFile(document.docId), document.content.mediaType);
    }
  }
}
