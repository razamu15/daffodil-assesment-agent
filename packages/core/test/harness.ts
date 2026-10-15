/**
 * Test harness: an InMemoryStore loaded with the starter pack as it stands on
 * Oct 14 (helpers, confirmed terms, documents, and the three September bills
 * recorded and checked), with a FixedClock and counting ids.
 *
 * Note: @helper-assistant/store is resolved through the workspace but isn't in
 * core's devDependencies (adding it needs a lockfile change; see the Track A report).
 */
import { FixedClock, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { StoreRecord } from "@helper-assistant/domain";
import {
  STARTER_PACK_TODAY,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "@helper-assistant/fixtures";
import { InMemoryStore } from "@helper-assistant/store";
import { checkStoredBill } from "../src/index";
import type { CoreDeps } from "../src/index";

export function countingIds(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export async function starterPackDeps(options: { withBills: boolean } = { withBills: true }): Promise<CoreDeps & { store: InMemoryStore }> {
  const store = new InMemoryStore();
  const deps = { store, clock: FixedClock.onDate(STARTER_PACK_TODAY), newId: countingIds() };
  const records: StoreRecord[] = [
    { entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold },
    ...starterPackHelpers.map((value): StoreRecord => ({ entity: StoredEntity.HELPER, value })),
    ...starterPackTerms.map((value): StoreRecord => ({ entity: StoredEntity.TERM, value })),
    ...starterPackDocuments.map((value): StoreRecord => ({ entity: StoredEntity.DOCUMENT, value })),
  ];
  await store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  if (options.withBills) {
    for (const bill of starterPackBills) {
      const checked = { ...bill, latestCheck: await checkStoredBill(deps, bill) };
      await store.commit([{ record: { entity: StoredEntity.BILL, value: checked }, condition: { kind: WriteConditionKind.ABSENT } }]);
    }
  }
  return deps;
}

/** Where a proposal came from, for tests that don't care. */
export const testSource = { sessionId: null, turnId: null, docId: null };
