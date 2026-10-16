/**
 * Empties the deployed stack's app data, for starting a DATA_BACKEND=aws test
 * run from scratch: every item in every app table, every object in the uploads
 * bucket, and the long-term AgentCore memory records in the hint namespaces.
 * Raw chat events are left to expire (MEMORY_EVENT_EXPIRY_DAYS); after a reset
 * no session points at them. The stack itself is untouched.
 *
 *   npm run reset-aws-data -w @helper-assistant/local-server -- --yes
 *
 * Refuses to run without --yes: this deletes data for real.
 */
import { BatchDeleteMemoryRecordsCommand, BedrockAgentCoreClient, paginateListMemoryRecords } from "@aws-sdk/client-bedrock-agentcore";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, paginateListObjectsV2, S3Client } from "@aws-sdk/client-s3";
import { BatchWriteCommand, DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { DYNAMO_TABLE_SPECS } from "@helper-assistant/store";
import type { DynamoTable } from "@helper-assistant/store";
import { DEPLOYED_REGION, DEPLOYED_STACK_NAME, deployedResources } from "./deployedStack";

const DYNAMO_BATCH_WRITE_MAX = 25;
const S3_DELETE_MAX = 1000;
const MEMORY_BATCH_DELETE_MAX = 100;

const chunks = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

if (!process.argv.includes("--yes")) {
  console.error(`This deletes all app data in stack ${DEPLOYED_STACK_NAME} (${DEPLOYED_REGION}). Re-run with --yes to proceed.`);
  process.exit(1);
}

const { data, memory } = await deployedResources();

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: DEPLOYED_REGION }));
for (const [table, spec] of Object.entries(DYNAMO_TABLE_SPECS) as [DynamoTable, (typeof DYNAMO_TABLE_SPECS)[DynamoTable]][]) {
  const tableName = data.tableNames[table];
  const keys: Record<string, unknown>[] = [];
  for await (const page of paginateScan({ client: doc }, { TableName: tableName, ProjectionExpression: "#pk", ExpressionAttributeNames: { "#pk": spec.partitionKey.name } })) {
    keys.push(...(page.Items ?? []));
  }
  for (const batch of chunks(keys, DYNAMO_BATCH_WRITE_MAX)) {
    await doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: batch.map((Key) => ({ DeleteRequest: { Key } })) } }));
  }
  console.log(`${table}: deleted ${keys.length} item(s)`);
}

const s3 = new S3Client({ region: DEPLOYED_REGION });
const objectKeys: string[] = [];
for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: data.uploadsBucket })) {
  objectKeys.push(...(page.Contents ?? []).flatMap((o) => (o.Key === undefined ? [] : [o.Key])));
}
for (const batch of chunks(objectKeys, S3_DELETE_MAX)) {
  await s3.send(new DeleteObjectsCommand({ Bucket: data.uploadsBucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }));
}
console.log(`uploads: deleted ${objectKeys.length} object(s)`);

const agentCore = new BedrockAgentCoreClient({ region: DEPLOYED_REGION });
for (const { namespace } of memory.hintNamespaces) {
  const recordIds: string[] = [];
  for await (const page of paginateListMemoryRecords({ client: agentCore }, { memoryId: memory.memoryId, namespace })) {
    recordIds.push(...(page.memoryRecordSummaries ?? []).flatMap((r) => (r.memoryRecordId === undefined ? [] : [r.memoryRecordId])));
  }
  for (const batch of chunks(recordIds, MEMORY_BATCH_DELETE_MAX)) {
    await agentCore.send(new BatchDeleteMemoryRecordsCommand({ memoryId: memory.memoryId, records: batch.map((memoryRecordId) => ({ memoryRecordId })) }));
  }
  console.log(`memory ${namespace}: deleted ${recordIds.length} long-term record(s)`);
}
