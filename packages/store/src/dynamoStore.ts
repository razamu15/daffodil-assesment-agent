/**
 * DynamoStore: the real Store on DynamoDB, one table per entity (Doc 2 §5).
 * Same contract as InMemoryStore, checked by the shared conformance suite.
 *
 * - Reads are strongly consistent. Lists are a consistent Scan of the entity's
 *   table, filtered and ordered by queries.ts (the same code InMemoryStore uses).
 *   One household holds tens to hundreds of rows, so a Scan costs nothing, and
 *   it never shows a stale list right after a confirm the way an (eventually
 *   consistent) GSI query can. The GSIs stay on the tables for when data grows.
 * - `commit` is one TransactWriteItems: every op's condition, plus the
 *   APPROVED-bill invariant on every bill write, is checked by DynamoDB itself.
 *   When a transaction is cancelled, the failing op's old item says whether it
 *   was the invariant (IMMUTABLE_RECORD) or the caller's condition.
 * - nextActionRef is an atomic ADD on the counters table.
 *
 * Call sites: apps/local-server (DATA_BACKEND=aws) and, from gate I3, the Lambda
 * handlers; test/dynamoStore.test.ts.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, paginateScan, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import {
  BillStatus,
  STORE_MAX_OPS_PER_COMMIT,
  StoreCommitError,
  StoredEntity,
  StoreFailureReason,
  WriteConditionKind,
} from "@helper-assistant/domain";
import type {
  ActionFilter,
  ActionRef,
  AgreementTerm,
  Bill,
  BillFilter,
  Helper,
  HelperNote,
  Household,
  Id,
  OutboundMessage,
  PaymentRecord,
  PendingAction,
  Session,
  SourceDocument,
  Store,
  StoreRecord,
  Turn,
  WriteOp,
} from "@helper-assistant/domain";
import { DYNAMO_TABLE_SPECS } from "./dynamoTables";
import type { DynamoTableNames } from "./dynamoTables";
import { selectActions, selectBills, selectMessages, selectNotes, selectPayments, selectTerms, selectTurns, sortHelpers, sortSessions } from "./queries";

type Item = Record<string, unknown>;

/** The counters-table row behind nextActionRef. */
const ACTION_REF_COUNTER = "actionRef";

/** Index keys computed from a stored value (DYNAMO_TABLE_SPECS[...].derivedIndexKeys). */
const DERIVED_INDEX_KEYS: Partial<Record<StoredEntity, (value: Item) => Item>> = {
  BILL: (bill) => {
    const start = (bill as Bill).period.start;
    return { periodMonth: start.slice(0, 7), periodStart: start };
  },
};

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly tableNames: DynamoTableNames,
  ) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  // ── item mapping ─────────────────────────────────────────────────────────

  private toItem(entity: StoredEntity, value: object): Item {
    const spec = DYNAMO_TABLE_SPECS[entity];
    const item: Item = { ...value, ...(DERIVED_INDEX_KEYS[entity]?.(value as Item) ?? {}) };
    for (const key of spec.nullableIndexKeys) if (item[key] === null) delete item[key];
    for (const key of spec.compressedAttributes) item[key] = gzipSync(JSON.stringify(item[key]));
    return item;
  }

  private fromItem<T>(entity: StoredEntity, item: Item): T {
    const spec = DYNAMO_TABLE_SPECS[entity];
    const value: Item = { ...item };
    for (const key of spec.derivedIndexKeys) delete value[key];
    for (const key of spec.nullableIndexKeys) if (!(key in value)) value[key] = null;
    for (const key of spec.compressedAttributes) value[key] = JSON.parse(gunzipSync(value[key] as Uint8Array).toString("utf8"));
    return value as T;
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private async get<T>(entity: StoredEntity, id: string | number): Promise<T | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.tableNames[entity], Key: { [DYNAMO_TABLE_SPECS[entity].partitionKey.name]: id }, ConsistentRead: true }),
    );
    return Item === undefined ? null : this.fromItem<T>(entity, Item);
  }

  private async all<T>(entity: StoredEntity): Promise<T[]> {
    const values: T[] = [];
    for await (const page of paginateScan({ client: this.doc }, { TableName: this.tableNames[entity], ConsistentRead: true })) {
      for (const item of page.Items ?? []) values.push(this.fromItem<T>(entity, item));
    }
    return values;
  }

  async getHousehold(): Promise<Household | null> {
    const households = await this.all<Household>(StoredEntity.HOUSEHOLD);
    if (households.length > 1) throw new Error(`Expected one household, found ${households.length}`);
    return households[0] ?? null;
  }

  getHelper = (helperId: Id) => this.get<Helper>(StoredEntity.HELPER, helperId);
  listHelpers = async () => sortHelpers(await this.all<Helper>(StoredEntity.HELPER));

  getTerm = (termId: Id) => this.get<AgreementTerm>(StoredEntity.TERM, termId);
  listTerms = async (filter: { helperId?: Id } = {}) => selectTerms(await this.all<AgreementTerm>(StoredEntity.TERM), filter);

  getBill = (billId: Id) => this.get<Bill>(StoredEntity.BILL, billId);
  listBills = async (filter: BillFilter = {}) => selectBills(await this.all<Bill>(StoredEntity.BILL), filter);

  getAction = (ref: ActionRef) => this.get<PendingAction>(StoredEntity.ACTION, ref);
  listActions = async (filter: ActionFilter = {}) => selectActions(await this.all<PendingAction>(StoredEntity.ACTION), filter);

  async nextActionRef(): Promise<ActionRef> {
    const { Attributes } = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableNames.COUNTERS,
        Key: { [DYNAMO_TABLE_SPECS.COUNTERS.partitionKey.name]: ACTION_REF_COUNTER },
        UpdateExpression: "ADD #value :one",
        ExpressionAttributeNames: { "#value": "value" },
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return Attributes!.value as number;
  }

  getMessage = (messageId: Id) => this.get<OutboundMessage>(StoredEntity.MESSAGE, messageId);
  listMessages = async (filter: { helperId?: Id } = {}) => selectMessages(await this.all<OutboundMessage>(StoredEntity.MESSAGE), filter);

  listNotes = async (filter: { helperId?: Id } = {}) => selectNotes(await this.all<HelperNote>(StoredEntity.NOTE), filter);

  listPayments = async (filter: { helperId?: Id; billId?: Id } = {}) => selectPayments(await this.all<PaymentRecord>(StoredEntity.PAYMENT), filter);

  getDocument = (docId: Id) => this.get<SourceDocument>(StoredEntity.DOCUMENT, docId);

  getSession = (sessionId: Id) => this.get<Session>(StoredEntity.SESSION, sessionId);
  listSessions = async () => sortSessions(await this.all<Session>(StoredEntity.SESSION));

  getTurn = (turnId: Id) => this.get<Turn>(StoredEntity.TURN, turnId);
  listTurns = async (sessionId: Id) => selectTurns(await this.all<Turn>(StoredEntity.TURN), sessionId);

  // ── writes ───────────────────────────────────────────────────────────────

  async commit(ops: WriteOp[]): Promise<void> {
    if (ops.length > STORE_MAX_OPS_PER_COMMIT) {
      throw new StoreCommitError(StoreFailureReason.TOO_MANY_OPS, null, `${ops.length} ops exceeds ${STORE_MAX_OPS_PER_COMMIT}`);
    }
    if (ops.length === 0) return;
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: ops.map((op) => this.put(op)) }));
    } catch (error) {
      if (error instanceof TransactionCanceledException) throw this.commitError(ops, error);
      throw error;
    }
  }

  private put({ record, condition }: WriteOp): NonNullable<TransactWriteCommandInput["TransactItems"]>[number] {
    const pk = DYNAMO_TABLE_SPECS[record.entity].partitionKey.name;
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const clauses: string[] = [];

    // DynamoDB rejects an expression name the expression doesn't use, so #pk is added only where it is.
    if (condition.kind === WriteConditionKind.ABSENT || record.entity === StoredEntity.BILL) names["#pk"] = pk;
    if (condition.kind === WriteConditionKind.ABSENT) {
      clauses.push("attribute_not_exists(#pk)");
    } else {
      names["#version"] = "version";
      values[":expected"] = condition.expected;
      clauses.push("#version = :expected");
    }
    // The APPROVED-bill invariant rides on every bill write, whatever the caller's condition.
    if (record.entity === StoredEntity.BILL) {
      names["#status"] = "status";
      values[":approved"] = BillStatus.APPROVED;
      clauses.push("(attribute_not_exists(#pk) OR #status <> :approved)");
    }
    return {
      Put: {
        TableName: this.tableNames[record.entity],
        Item: this.toItem(record.entity, record.value),
        ConditionExpression: clauses.join(" AND "),
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length === 0 ? {} : { ExpressionAttributeValues: values }),
        ReturnValuesOnConditionCheckFailure: "ALL_OLD",
      },
    };
  }

  /** Maps a cancelled transaction to the first op that failed its condition. */
  private commitError(ops: WriteOp[], error: TransactionCanceledException): Error {
    const reasons = error.CancellationReasons ?? [];
    const index = reasons.findIndex((r) => r.Code === "ConditionalCheckFailed");
    if (index === -1) return error; // e.g. TransactionConflict: not a contract failure, so it stays an AWS error.
    const record: StoreRecord = ops[index]!.record;
    // The old item comes back in raw AttributeValue form: { status: { S: "APPROVED" } }.
    const oldStatus = (reasons[index]!.Item as { status?: { S?: string } } | undefined)?.status?.S;
    if (record.entity === StoredEntity.BILL && oldStatus === BillStatus.APPROVED) {
      return new StoreCommitError(StoreFailureReason.IMMUTABLE_RECORD, index, `Bill ${record.value.billId} is approved and can't be changed`);
    }
    return new StoreCommitError(StoreFailureReason.CONDITION_FAILED, index, `${record.entity} write ${index} failed its ${ops[index]!.condition.kind} condition`);
  }
}
