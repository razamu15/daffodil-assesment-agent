/**
 * Smoke tests only. The full Store conformance suite (run against InMemoryStore
 * and DynamoStore) is Track A's deliverable.
 */
import { describe, expect, it } from "vitest";
import { BillStatus, StoreCommitError, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import { starterPackBills, starterPackHelpers } from "@helper-assistant/fixtures";
import { InMemoryStore } from "../src/index";

const create = { kind: WriteConditionKind.ABSENT } as const;

describe("InMemoryStore", () => {
  it("creates, reads and refuses duplicate creates", async () => {
    const store = new InMemoryStore();
    const priya = starterPackHelpers[0]!;
    await store.commit([{ record: { entity: StoredEntity.HELPER, value: priya }, condition: create }]);
    expect(await store.getHelper(priya.helperId)).toEqual(priya);
    await expect(store.commit([{ record: { entity: StoredEntity.HELPER, value: priya }, condition: create }])).rejects.toThrow(StoreCommitError);
  });

  it("is atomic: one failed condition applies nothing", async () => {
    const store = new InMemoryStore();
    const [priya, lupe] = starterPackHelpers;
    await store.commit([{ record: { entity: StoredEntity.HELPER, value: priya! }, condition: create }]);
    await expect(
      store.commit([
        { record: { entity: StoredEntity.HELPER, value: lupe! }, condition: create },
        { record: { entity: StoredEntity.HELPER, value: { ...priya!, version: 2 } }, condition: { kind: WriteConditionKind.VERSION, expected: 7 } },
      ]),
    ).rejects.toThrow(StoreCommitError);
    expect(await store.getHelper(lupe!.helperId)).toBeNull();
  });

  it("never overwrites an approved bill, whatever the condition", async () => {
    const store = new InMemoryStore();
    const bill = { ...starterPackBills[2]!, status: BillStatus.APPROVED };
    await store.commit([{ record: { entity: StoredEntity.BILL, value: bill }, condition: create }]);
    const edit = { ...bill, statedTotalCents: 1, version: 2 };
    await expect(
      store.commit([{ record: { entity: StoredEntity.BILL, value: edit }, condition: { kind: WriteConditionKind.VERSION, expected: 1 } }]),
    ).rejects.toMatchObject({ reason: "IMMUTABLE_RECORD" });
  });

  it("returns copies, not live references", async () => {
    const store = new InMemoryStore();
    const priya = starterPackHelpers[0]!;
    await store.commit([{ record: { entity: StoredEntity.HELPER, value: priya }, condition: create }]);
    const read = (await store.getHelper(priya.helperId))!;
    read.name = "mutated";
    expect((await store.getHelper(priya.helperId))!.name).toBe("Priya");
  });

  it("hands out increasing action refs", async () => {
    const store = new InMemoryStore();
    expect([await store.nextActionRef(), await store.nextActionRef()]).toEqual([1, 2]);
  });
});
