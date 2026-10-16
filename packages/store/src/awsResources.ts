/**
 * The deployed data resources, read from the environment the Lambdas get from
 * CDK (infra constructs Data: TABLE_* and UPLOADS_BUCKET). The local server
 * reads the same variables off the deployed Agent Lambda, so local and deployed
 * runs can't point at different tables. A missing variable fails loudly.
 *
 * Call sites: apps/local-server (DATA_BACKEND=aws); from gate I3, the Lambda handlers.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DYNAMO_TABLE_SPECS } from "./dynamoTables";
import type { DynamoTable, DynamoTableNames } from "./dynamoTables";
import { DynamoStore } from "./dynamoStore";
import { S3BlobStore } from "./s3BlobStore";

export const UPLOADS_BUCKET_ENV_VAR = "UPLOADS_BUCKET";

export type AwsDataConfig = { region: string; tableNames: DynamoTableNames; uploadsBucket: string };

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is not set; it comes from the deployed stack.`);
  return value.trim();
}

export function awsDataConfigFromEnv(env: Record<string, string | undefined>, region: string): AwsDataConfig {
  const tableNames = Object.fromEntries(
    (Object.entries(DYNAMO_TABLE_SPECS) as [DynamoTable, (typeof DYNAMO_TABLE_SPECS)[DynamoTable]][]).map(([table, spec]) => [table, required(env, spec.envVar)]),
  ) as DynamoTableNames;
  return { region, tableNames, uploadsBucket: required(env, UPLOADS_BUCKET_ENV_VAR) };
}

export function awsDataServices(config: AwsDataConfig): { store: DynamoStore; blobStore: S3BlobStore } {
  return {
    store: new DynamoStore(new DynamoDBClient({ region: config.region }), config.tableNames),
    blobStore: new S3BlobStore(new S3Client({ region: config.region }), config.uploadsBucket),
  };
}
