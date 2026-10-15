/**
 * Agent test harness: an InMemoryStore loaded with the starter pack as it stands
 * on Oct 14 (helpers, confirmed terms, documents and, optionally, the three
 * September bills recorded and checked), fake blob bytes for the screenshots, a
 * FixedClock, counting ids, InMemoryMemory and a scripted FakeModel.
 */
import { checkStoredBill, startTurn } from "@helper-assistant/core";
import { DocumentStorage, FixedClock, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { StoreRecord, Turn } from "@helper-assistant/domain";
import {
  STARTER_PACK_TODAY,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "@helper-assistant/fixtures";
import { InMemoryBlobStore, InMemoryStore } from "@helper-assistant/store";
import { emptyTrace, FakeModel, InMemoryMemory, runTurn } from "../src/index";
import type { AgentDeps, FakeModelStep, ToolContext } from "../src/index";

export type TestDeps = AgentDeps & { store: InMemoryStore; memory: InMemoryMemory; model: FakeModel };

export function countingIds(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export async function starterPackAgent(
  script: FakeModelStep[],
  options: { withBills: boolean; withHelpersAndTerms: boolean } = { withBills: true, withHelpersAndTerms: true },
): Promise<TestDeps> {
  const store = new InMemoryStore();
  const blobStore = new InMemoryBlobStore();
  const deps: TestDeps = {
    store,
    blobStore,
    clock: FixedClock.onDate(STARTER_PACK_TODAY),
    newId: countingIds(),
    model: new FakeModel(script),
    memory: new InMemoryMemory(),
  };
  const records: StoreRecord[] = [
    { entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold },
    ...starterPackDocuments.map((value): StoreRecord => ({ entity: StoredEntity.DOCUMENT, value })),
  ];
  if (options.withHelpersAndTerms) {
    records.push(
      ...starterPackHelpers.map((value): StoreRecord => ({ entity: StoredEntity.HELPER, value })),
      ...starterPackTerms.map((value): StoreRecord => ({ entity: StoredEntity.TERM, value })),
    );
  }
  await store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  for (const document of starterPackDocuments) {
    if (document.content.storage === DocumentStorage.BLOB) await blobStore.put(document.content.blobKey, new Uint8Array([1, 2, 3]), document.content.mediaType);
  }
  if (options.withBills) {
    for (const bill of starterPackBills) {
      const checked = { ...bill, latestCheck: await checkStoredBill(deps, bill) };
      await store.commit([{ record: { entity: StoredEntity.BILL, value: checked }, condition: { kind: WriteConditionKind.ABSENT } }]);
    }
  }
  return deps;
}

/** What api POST /api/chat does (lock + QUEUED turn), then the run the TurnRunner would start. */
export async function chat(deps: TestDeps, text: string, options: { sessionId?: string; attachmentDocIds?: string[] } = {}): Promise<Turn> {
  const { turn } = await startTurn(deps, { sessionId: options.sessionId ?? null, text, attachmentDocIds: options.attachmentDocIds ?? [] });
  return runTurn({ turnId: turn.turnId, sessionId: turn.sessionId }, deps);
}

/** A tool context outside any turn, for calling tools directly. */
export function toolContext(deps: TestDeps, statement: ToolContext["statement"] = null): ToolContext {
  return { deps, sessionId: "session-test", turnId: "turn-test", statement, trace: emptyTrace() };
}
