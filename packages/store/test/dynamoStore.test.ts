/**
 * DynamoStore against the shared Store conformance suite (gate I2), on real
 * DynamoDB. Opt-in, because it needs AWS credentials and creates resources:
 *
 *   DYNAMO_CONFORMANCE_REGION=us-east-1 npm test -w @helper-assistant/store
 *
 * It creates its own scratch tables (partition keys only; the store never
 * queries a GSI), empties them before each test, and deletes them at the end.
 * The app's deployed tables are never touched.
 */
import { afterAll, beforeAll, describe, vi } from "vitest";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { DYNAMO_TABLE_SPECS, DynamoStore } from "../src/index";
import type { DynamoTable, DynamoTableNames } from "../src/index";
import { runStoreConformance } from "./storeConformance";

const region = process.env.DYNAMO_CONFORMANCE_REGION;
const BATCH_WRITE_MAX = 25;
const TABLE_CREATE_TIMEOUT_SECONDS = 120;
// Each test empties 12 tables and makes real calls first.
vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(region === undefined)("DynamoStore (real DynamoDB)", () => {
  const client = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(client);
  const run = Date.now().toString(36);
  const entries = Object.entries(DYNAMO_TABLE_SPECS) as [DynamoTable, (typeof DYNAMO_TABLE_SPECS)[DynamoTable]][];
  const tableNames = Object.fromEntries(entries.map(([table]) => [table, `HelperAssistantConformance-${run}-${table}`])) as DynamoTableNames;

  beforeAll(async () => {
    await Promise.all(
      entries.map(([table, spec]) =>
        client.send(
          new CreateTableCommand({
            TableName: tableNames[table],
            BillingMode: "PAY_PER_REQUEST",
            KeySchema: [{ AttributeName: spec.partitionKey.name, KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: spec.partitionKey.name, AttributeType: spec.partitionKey.type }],
          }),
        ),
      ),
    );
    await Promise.all(entries.map(([table]) => waitUntilTableExists({ client, maxWaitTime: TABLE_CREATE_TIMEOUT_SECONDS }, { TableName: tableNames[table] })));
  }, TABLE_CREATE_TIMEOUT_SECONDS * 1000);

  afterAll(async () => {
    await Promise.all(entries.map(([table]) => client.send(new DeleteTableCommand({ TableName: tableNames[table] }))));
  });

  async function emptyTables(): Promise<void> {
    await Promise.all(
      entries.map(async ([table, spec]) => {
        const keys: Record<string, unknown>[] = [];
        for await (const page of paginateScan({ client: doc }, { TableName: tableNames[table], ProjectionExpression: "#pk", ExpressionAttributeNames: { "#pk": spec.partitionKey.name } })) {
          keys.push(...(page.Items ?? []));
        }
        for (let i = 0; i < keys.length; i += BATCH_WRITE_MAX) {
          const batch = keys.slice(i, i + BATCH_WRITE_MAX).map((Key) => ({ DeleteRequest: { Key } }));
          await doc.send(new BatchWriteCommand({ RequestItems: { [tableNames[table]]: batch } }));
        }
      }),
    );
  }

  runStoreConformance("DynamoStore", async () => {
    await emptyTables();
    return new DynamoStore(client, tableNames);
  });
});
