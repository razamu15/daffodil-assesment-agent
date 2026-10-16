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
  PaymentRecord,
  PendingAction,
  Session,
  SourceDocument,
  Store,
  StoreRecord,
  Turn,
  WriteOp,
} from "@helper-assistant/domain";
import { selectActions, selectBills, selectMessages, selectNotes, selectPayments, selectTerms, selectTurns, sortHelpers, sortSessions } from "./queries";

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
  PAYMENT: (v) => v.paymentId,
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
    return sortHelpers(this.all<Helper>(StoredEntity.HELPER));
  }

  async getTerm(termId: Id): Promise<AgreementTerm | null> {
    return this.get<AgreementTerm>(StoredEntity.TERM, termId);
  }

  async listTerms(filter: { helperId?: Id } = {}): Promise<AgreementTerm[]> {
    return selectTerms(this.all<AgreementTerm>(StoredEntity.TERM), filter);
  }

  async getBill(billId: Id): Promise<Bill | null> {
    return this.get<Bill>(StoredEntity.BILL, billId);
  }

  async listBills(filter: BillFilter = {}): Promise<Bill[]> {
    return selectBills(this.all<Bill>(StoredEntity.BILL), filter);
  }

  async getAction(ref: ActionRef): Promise<PendingAction | null> {
    return this.get<PendingAction>(StoredEntity.ACTION, String(ref));
  }

  async listActions(filter: ActionFilter = {}): Promise<PendingAction[]> {
    return selectActions(this.all<PendingAction>(StoredEntity.ACTION), filter);
  }

  async nextActionRef(): Promise<ActionRef> {
    this.actionRefCounter += 1;
    return this.actionRefCounter;
  }

  async getMessage(messageId: Id): Promise<OutboundMessage | null> {
    return this.get<OutboundMessage>(StoredEntity.MESSAGE, messageId);
  }

  async listMessages(filter: { helperId?: Id } = {}): Promise<OutboundMessage[]> {
    return selectMessages(this.all<OutboundMessage>(StoredEntity.MESSAGE), filter);
  }

  async listNotes(filter: { helperId?: Id } = {}): Promise<HelperNote[]> {
    return selectNotes(this.all<HelperNote>(StoredEntity.NOTE), filter);
  }

  async listPayments(filter: { helperId?: Id; billId?: Id } = {}): Promise<PaymentRecord[]> {
    return selectPayments(this.all<PaymentRecord>(StoredEntity.PAYMENT), filter);
  }

  async getDocument(docId: Id): Promise<SourceDocument | null> {
    return this.get<SourceDocument>(StoredEntity.DOCUMENT, docId);
  }

  async getSession(sessionId: Id): Promise<Session | null> {
    return this.get<Session>(StoredEntity.SESSION, sessionId);
  }

  async listSessions(): Promise<Session[]> {
    return sortSessions(this.all<Session>(StoredEntity.SESSION));
  }

  async getTurn(turnId: Id): Promise<Turn | null> {
    return this.get<Turn>(StoredEntity.TURN, turnId);
  }

  async listTurns(sessionId: Id): Promise<Turn[]> {
    return selectTurns(this.all<Turn>(StoredEntity.TURN), sessionId);
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
