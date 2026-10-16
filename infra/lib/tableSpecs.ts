/**
 * The DynamoDB tables from Doc 2 §5, as data: one table per entity, keyed by the
 * entity's own id, plus the GSIs its list queries need.
 *
 * `envVar` is how each Lambda learns the generated table name. Gate I2's
 * DynamoStore reads the same names, so these strings are the contract.
 *
 * Call sites: constructs/data.ts (creates the tables), test/stack.test.ts.
 */

export type KeyType = "S" | "N";
export type KeyAttribute = { name: string; type: KeyType };

export type IndexSpec = { indexName: string; partitionKey: KeyAttribute; sortKey: KeyAttribute | null };

export type TableSpec = {
  /** Construct id, and the readable part of the generated table name. */
  id: string;
  envVar: string;
  partitionKey: KeyAttribute;
  indexes: IndexSpec[];
};

const s = (name: string): KeyAttribute => ({ name, type: "S" });
const n = (name: string): KeyAttribute => ({ name, type: "N" });

export const TABLE_SPECS: TableSpec[] = [
  { id: "Households", envVar: "TABLE_HOUSEHOLDS", partitionKey: s("householdId"), indexes: [] },
  { id: "Helpers", envVar: "TABLE_HELPERS", partitionKey: s("helperId"), indexes: [] },
  {
    id: "Terms",
    envVar: "TABLE_TERMS",
    partitionKey: s("termId"),
    indexes: [{ indexName: "byHelper", partitionKey: s("helperId"), sortKey: s("effectiveFrom") }],
  },
  {
    id: "Bills",
    envVar: "TABLE_BILLS",
    partitionKey: s("billId"),
    indexes: [
      { indexName: "byMonth", partitionKey: s("periodMonth"), sortKey: s("periodStart") },
      { indexName: "byHelper", partitionKey: s("helperId"), sortKey: s("periodStart") },
    ],
  },
  {
    id: "Actions",
    envVar: "TABLE_ACTIONS",
    partitionKey: n("ref"),
    indexes: [
      { indexName: "byStatus", partitionKey: s("status"), sortKey: n("ref") },
      { indexName: "byTarget", partitionKey: s("targetKey"), sortKey: n("ref") },
    ],
  },
  {
    id: "Messages",
    envVar: "TABLE_MESSAGES",
    partitionKey: s("messageId"),
    indexes: [{ indexName: "byHelper", partitionKey: s("helperId"), sortKey: s("createdAt") }],
  },
  {
    id: "Notes",
    envVar: "TABLE_NOTES",
    partitionKey: s("noteId"),
    indexes: [{ indexName: "byHelper", partitionKey: s("helperId"), sortKey: s("createdAt") }],
  },
  {
    id: "Payments",
    envVar: "TABLE_PAYMENTS",
    partitionKey: s("paymentId"),
    indexes: [
      { indexName: "byHelper", partitionKey: s("helperId"), sortKey: s("paidOn") },
      { indexName: "byBill", partitionKey: s("billId"), sortKey: null },
    ],
  },
  { id: "Documents", envVar: "TABLE_DOCUMENTS", partitionKey: s("docId"), indexes: [] },
  { id: "Sessions", envVar: "TABLE_SESSIONS", partitionKey: s("sessionId"), indexes: [] },
  {
    id: "Turns",
    envVar: "TABLE_TURNS",
    partitionKey: s("turnId"),
    indexes: [{ indexName: "bySession", partitionKey: s("sessionId"), sortKey: s("createdAt") }],
  },
  { id: "Counters", envVar: "TABLE_COUNTERS", partitionKey: s("name"), indexes: [] },
];
