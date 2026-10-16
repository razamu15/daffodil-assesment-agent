/**
 * System of record: the per-entity DynamoDB tables (tableSpecs.ts) and the
 * private uploads bucket that backs the BlobStore seam. Everything is destroyed
 * with the stack.
 */
import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Attribute } from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { KeyAttribute } from "../tableSpecs";
import { TABLE_SPECS } from "../tableSpecs";

const ATTRIBUTE_TYPE = { S: AttributeType.STRING, N: AttributeType.NUMBER } as const;

const toAttribute = (key: KeyAttribute): Attribute => ({ name: key.name, type: ATTRIBUTE_TYPE[key.type] });

export class Data extends Construct {
  readonly tables: { envVar: string; table: Table }[];
  readonly uploadsBucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.tables = TABLE_SPECS.map((spec) => {
      const table = new Table(this, spec.id, {
        partitionKey: toAttribute(spec.partitionKey),
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      for (const index of spec.indexes) {
        table.addGlobalSecondaryIndex({
          indexName: index.indexName,
          partitionKey: toAttribute(index.partitionKey),
          ...(index.sortKey === null ? {} : { sortKey: toAttribute(index.sortKey) }),
          projectionType: ProjectionType.ALL,
        });
      }
      return { envVar: spec.envVar, table };
    });

    this.uploadsBucket = new Bucket(this, "Uploads", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  /** `TABLE_*` env vars for a Lambda: one per table, holding the generated name. */
  tableEnvironment(): Record<string, string> {
    return Object.fromEntries(this.tables.map(({ envVar, table }) => [envVar, table.tableName]));
  }
}
