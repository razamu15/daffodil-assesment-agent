/**
 * What the in-memory store holds when the local server starts.
 *
 * Mirrors packages/agent/scripts/live/seed.ts (the CLI's seeding), plus an
 * empty mode for the real product flow. Named future fix: give the starter-pack
 * seeding one shared home (it's the same invariant twice) once a third caller
 * appears, e.g. the I2 DynamoStore loader.
 *
 * Call site: index.ts.
 */
import { checkStoredBill } from "@helper-assistant/core";
import type { CoreDeps } from "@helper-assistant/core";
import { DocumentStorage, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { BlobStore, StoreRecord } from "@helper-assistant/domain";
import { starterPackBills, starterPackDocuments, starterPackHelpers, starterPackHousehold, starterPackTerms } from "@helper-assistant/fixtures";
import { readStarterPackFile } from "@helper-assistant/fixtures/node";

export const SeedMode = {
  /** Nothing. Upload and paste the starter pack through the UI, as Jordan would. */
  EMPTY: "empty",
  /** The household and the starter-pack documents (with image bytes), not yet read. */
  DOCUMENTS: "documents",
  /** Documents plus helpers, confirmed terms and the September bills, checked. */
  FULL: "full",
} as const;
export type SeedMode = (typeof SeedMode)[keyof typeof SeedMode];
export const SEED_MODES: readonly SeedMode[] = Object.values(SeedMode);

export async function seed(mode: SeedMode, deps: CoreDeps & { blobStore: BlobStore }): Promise<void> {
  if (mode === SeedMode.EMPTY) return;

  const documents: StoreRecord[] = [
    { entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold },
    ...starterPackDocuments.map((value): StoreRecord => ({ entity: StoredEntity.DOCUMENT, value })),
  ];
  await deps.store.commit(documents.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  for (const document of starterPackDocuments) {
    if (document.content.storage === DocumentStorage.BLOB) {
      await deps.blobStore.put(document.content.blobKey, await readStarterPackFile(document.docId), document.content.mediaType);
    }
  }
  if (mode === SeedMode.DOCUMENTS) return;

  const records: StoreRecord[] = [
    ...starterPackHelpers.map((value): StoreRecord => ({ entity: StoredEntity.HELPER, value })),
    ...starterPackTerms.map((value): StoreRecord => ({ entity: StoredEntity.TERM, value })),
  ];
  await deps.store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  for (const bill of starterPackBills) {
    const checked = { ...bill, latestCheck: await checkStoredBill(deps, bill) };
    await deps.store.commit([{ record: { entity: StoredEntity.BILL, value: checked }, condition: { kind: WriteConditionKind.ABSENT } }]);
  }
}
