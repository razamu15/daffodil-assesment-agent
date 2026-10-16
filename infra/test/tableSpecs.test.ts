/**
 * The CDK table specs (lib/tableSpecs.ts) and DynamoStore's view of the same
 * tables (packages/store/src/dynamoTables.ts) are written twice, because infra
 * doesn't depend on app packages. This keeps them in step.
 */
import { describe, expect, it } from "vitest";
import { DYNAMO_TABLE_SPECS } from "../../packages/store/src/dynamoTables";
import { TABLE_SPECS } from "../lib/tableSpecs";

describe("table specs match DynamoStore", () => {
  it("has the same tables, env vars and partition keys", () => {
    const infra = TABLE_SPECS.map((t) => ({ envVar: t.envVar, partitionKey: t.partitionKey })).sort((a, b) => a.envVar.localeCompare(b.envVar));
    const store = Object.values(DYNAMO_TABLE_SPECS)
      .map((t) => ({ envVar: t.envVar, partitionKey: t.partitionKey }))
      .sort((a, b) => a.envVar.localeCompare(b.envVar));
    expect(store).toEqual(infra);
  });

  it("only treats real GSI key attributes as nullable or derived index keys", () => {
    for (const spec of Object.values(DYNAMO_TABLE_SPECS)) {
      const table = TABLE_SPECS.find((t) => t.envVar === spec.envVar)!;
      const indexKeys = new Set(table.indexes.flatMap((i) => [i.partitionKey.name, ...(i.sortKey === null ? [] : [i.sortKey.name])]));
      for (const key of [...spec.nullableIndexKeys, ...spec.derivedIndexKeys]) expect(indexKeys, `${spec.envVar}.${key}`).toContain(key);
    }
  });
});
