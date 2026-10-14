/**
 * InMemoryStore: the Store fake (Doc 4 §2). Same contract as DynamoStore,
 * including atomic commits, version conditions, the APPROVED-bill invariant and
 * the per-commit op limit, so fakes don't hide behaviour the real store has.
 *
 * Values are deep-cloned in and out so callers can't mutate stored state.
 */
import {
  BillStatus,
  STORE_MAX_OPS_PER_COMMIT,
  StoreCommitError,
  StoreFailureReason,
  StoredEntity,
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
  PendingAction,
  Session,
  SourceDocument,
  Store,
  StoreRecord,
  Turn,
  WriteOp,
} from "@helper-assistant/domain";

type ValueOf<E extends StoredEntity> = Extract<StoreRecord, { entity: E }>["value"];

/** Identity of a record within its entity table. Household is a singleton. */
const RECORD_ID: { [E in StoredEntity]: (value: ValueOf<E>) => string } = {
  HOUSEHOLD: () => "HOUSEHOLD",
  HELPER: (v) => v.helperId,
  TERM: (v) => v.termId,
  BILL: (v) => v.billId,
  ACTION: (v) => String(v.ref),
  MESSAGE: (v) => v.messageId,
  NOTE: (v) => v.noteId,
  DOCUMENT: (v) => v.docId,
  SESSION: (v) => v.sessionId,
  TURN: (v) => v.turnId,
};

/** Every stored entity except Document carries a version. Documents are immutable: create only. */
function versionOf(record: StoreRecord): number | null {
  return record.entity === StoredEntity.DOCUMENT ? null : record.value.version;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryStore implements Store {
  private readonly tables = new Map<StoredEntity, Map<string, StoreRecord>>(
    Object.values(StoredEntity).map((entity) => [entity, new Map()]),
  );
  private actionRefCounter = 0;

  // ── reads ────────────────────────────────────────────────────────────────

  /** Callers pass the value type matching `entity`; the table only ever holds that entity's records. */
  private get<T extends StoreRecord["value"]>(entity: StoredEntity, id: string): T | null {
    const record = this.tables.get(entity)!.get(id);
    return record ? (clone(record.value) as T) : null;
  }

  private all<T extends StoreRecord["value"]>(entity: StoredEntity): T[] {
    return [...this.tables.get(entity)!.values()].map((r) => clone(r.value) as T);
  }

  async getHousehold(): Promise<Household | null> {
    return this.get<Household>(StoredEntity.HOUSEHOLD, "HOUSEHOLD");
  }

  async getHelper(helperId: Id): Promise<Helper | null> {
    return this.get<Helper>(StoredEntity.HELPER, helperId);
  }

  async listHelpers(): Promise<Helper[]> {
    return this.all<Helper>(StoredEntity.HELPER).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTerm(termId: Id): Promise<AgreementTerm | null> {
    return this.get<AgreementTerm>(StoredEntity.TERM, termId);
  }

  async listTerms(filter: { helperId?: Id } = {}): Promise<AgreementTerm[]> {
    return this.all<AgreementTerm>(StoredEntity.TERM)
      .filter((t) => filter.helperId === undefined || t.helperId === filter.helperId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));
  }

  async getBill(billId: Id): Promise<Bill | null> {
    return this.get<Bill>(StoredEntity.BILL, billId);
  }

  async listBills(filter: BillFilter = {}): Promise<Bill[]> {
    return this.all<Bill>(StoredEntity.BILL)
      .filter(
        (b) =>
          (filter.helperId === undefined || b.helperId === filter.helperId) &&
          (filter.month === undefined || b.period.start.startsWith(filter.month)) &&
          (filter.status === undefined || b.status === filter.status),
      )
      .sort((a, b) => a.period.start.localeCompare(b.period.start) || a.receivedAt.localeCompare(b.receivedAt));
  }

  async getAction(ref: ActionRef): Promise<PendingAction | null> {
    return this.get<PendingAction>(StoredEntity.ACTION, String(ref));
  }

  async listActions(filter: ActionFilter = {}): Promise<PendingAction[]> {
    return this.all<PendingAction>(StoredEntity.ACTION)
      .filter(
        (a) =>
          (filter.status === undefined || a.status === filter.status) &&
          (filter.targetKey === undefined || a.targetKey === filter.targetKey),
      )
      .sort((a, b) => a.ref - b.ref);
  }

  async nextActionRef(): Promise<ActionRef> {
    this.actionRefCounter += 1;
    return this.actionRefCounter;
  }

  async getMessage(messageId: Id): Promise<OutboundMessage | null> {
    return this.get<OutboundMessage>(StoredEntity.MESSAGE, messageId);
  }

  async listMessages(filter: { helperId?: Id } = {}): Promise<OutboundMessage[]> {
    return this.all<OutboundMessage>(StoredEntity.MESSAGE)
      .filter((m) => filter.helperId === undefined || m.helperId === filter.helperId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listNotes(filter: { helperId?: Id } = {}): Promise<HelperNote[]> {
    return this.all<HelperNote>(StoredEntity.NOTE)
      .filter((n) => filter.helperId === undefined || n.helperId === filter.helperId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getDocument(docId: Id): Promise<SourceDocument | null> {
    return this.get<SourceDocument>(StoredEntity.DOCUMENT, docId);
  }

  async getSession(sessionId: Id): Promise<Session | null> {
    return this.get<Session>(StoredEntity.SESSION, sessionId);
  }

  async listSessions(): Promise<Session[]> {
    return this.all<Session>(StoredEntity.SESSION).sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  async getTurn(turnId: Id): Promise<Turn | null> {
    return this.get<Turn>(StoredEntity.TURN, turnId);
  }

  async listTurns(sessionId: Id): Promise<Turn[]> {
    return this.all<Turn>(StoredEntity.TURN)
      .filter((t) => t.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ── writes ───────────────────────────────────────────────────────────────

  async commit(ops: WriteOp[]): Promise<void> {
    if (ops.length > STORE_MAX_OPS_PER_COMMIT) {
      throw new StoreCommitError(StoreFailureReason.TOO_MANY_OPS, null, `${ops.length} ops exceeds ${STORE_MAX_OPS_PER_COMMIT}`);
    }
    // Check every op before applying any: all or nothing.
    ops.forEach((op, index) => this.assertWritable(op, index));
    for (const { record } of ops) {
      const id = (RECORD_ID[record.entity] as (v: unknown) => string)(record.value);
      this.tables.get(record.entity)!.set(id, clone(record));
    }
  }

  private assertWritable({ record, condition }: WriteOp, index: number): void {
    const id = (RECORD_ID[record.entity] as (v: unknown) => string)(record.value);
    const existing = this.tables.get(record.entity)!.get(id);

    if (existing?.entity === StoredEntity.BILL && existing.value.status === BillStatus.APPROVED) {
      throw new StoreCommitError(StoreFailureReason.IMMUTABLE_RECORD, index, `Bill ${id} is approved and can't be changed`);
    }
    if (condition.kind === WriteConditionKind.ABSENT && existing) {
      throw new StoreCommitError(StoreFailureReason.CONDITION_FAILED, index, `${record.entity} ${id} already exists`);
    }
    if (condition.kind === WriteConditionKind.VERSION) {
      const storedVersion = existing ? versionOf(existing) : null;
      if (storedVersion !== condition.expected) {
        throw new StoreCommitError(
          StoreFailureReason.CONDITION_FAILED,
          index,
          `${record.entity} ${id}: expected version ${condition.expected}, found ${storedVersion ?? "none"}`,
        );
      }
    }
  }
}
