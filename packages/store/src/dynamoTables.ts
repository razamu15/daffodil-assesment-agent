/**
 * How DynamoStore lays each stored entity onto its DynamoDB table (Doc 2 §5):
 * the env var that names the table, the partition key, and the attributes that
 * need care on the way in and out.
 *
 * Mirrors infra/lib/tableSpecs.ts (infra doesn't depend on app packages). The
 * infra test `tableSpecs.test.ts` compares the two, so they can't drift.
 *
 * Call sites: dynamoStore.ts (item mapping), awsResources.ts (table names from env),
 * the DynamoStore conformance test (creating scratch tables).
 */
import { StoredEntity } from "@helper-assistant/domain";

/** Every table: one per stored entity, plus the counters table behind nextActionRef. */
export const DynamoTable = { ...StoredEntity, COUNTERS: "COUNTERS" } as const;
export type DynamoTable = (typeof DynamoTable)[keyof typeof DynamoTable];

export type DynamoTableSpec = {
  envVar: string;
  partitionKey: { name: string; type: "S" | "N" };
  /**
   * GSI key attributes whose value may be null on the entity. A GSI key can't
   * hold NULL, so a null one is left off the item and put back as null on read.
   */
  nullableIndexKeys: string[];
  /** Index keys computed from the value, written for the GSIs only and dropped on read. */
  derivedIndexKeys: string[];
  /** Attributes stored gzip-compressed (large, rarely read traces), to stay under the 400 KB item limit. */
  compressedAttributes: string[];
};

const S = (name: string) => ({ name, type: "S" as const });

const spec = (envVar: string, partitionKey: DynamoTableSpec["partitionKey"], extra: Partial<DynamoTableSpec> = {}): DynamoTableSpec => ({
  envVar,
  partitionKey,
  nullableIndexKeys: [],
  derivedIndexKeys: [],
  compressedAttributes: [],
  ...extra,
});

export const DYNAMO_TABLE_SPECS: Record<DynamoTable, DynamoTableSpec> = {
  HOUSEHOLD: spec("TABLE_HOUSEHOLDS", S("householdId")),
  HELPER: spec("TABLE_HELPERS", S("helperId")),
  TERM: spec("TABLE_TERMS", S("termId")),
  BILL: spec("TABLE_BILLS", S("billId"), { derivedIndexKeys: ["periodMonth", "periodStart"] }),
  ACTION: spec("TABLE_ACTIONS", { name: "ref", type: "N" }, { nullableIndexKeys: ["targetKey"] }),
  MESSAGE: spec("TABLE_MESSAGES", S("messageId"), { nullableIndexKeys: ["helperId"] }),
  NOTE: spec("TABLE_NOTES", S("noteId"), { nullableIndexKeys: ["helperId"] }),
  PAYMENT: spec("TABLE_PAYMENTS", S("paymentId"), { nullableIndexKeys: ["billId", "helperId"] }),
  DOCUMENT: spec("TABLE_DOCUMENTS", S("docId")),
  SESSION: spec("TABLE_SESSIONS", S("sessionId")),
  TURN: spec("TABLE_TURNS", S("turnId"), { compressedAttributes: ["toolCalls"] }),
  COUNTERS: spec("TABLE_COUNTERS", S("name")),
};

export type DynamoTableNames = Record<DynamoTable, string>;
