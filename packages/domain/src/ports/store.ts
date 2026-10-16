/**
 * Store: the system of record (Doc 4 §2 seam). Fake: InMemoryStore. Real: DynamoStore.
 *
 * Reads are typed per entity. All writes go through one atomic `commit`, so a
 * confirm can flip the action to CONFIRMED and apply its change in the same
 * transaction (DynamoDB TransactWriteItems), or do neither.
 *
 * Version contract: the caller writes the record with its new version already
 * set (expected + 1, or 1 on create) and passes the condition. The store never
 * bumps versions itself.
 *
 * Invariant enforced by every implementation, regardless of the condition passed:
 * a BILL whose stored status is APPROVED can never be overwritten
 * (StoreCommitError IMMUTABLE_RECORD). This backs Doc 3 §4.6 step 4.
 *
 * Every list order ends on the record's id, so ties are deterministic.
 *
 * The household is implicit: a Store instance is scoped to one household.
 */
import type { AgreementTerm } from "../entities/agreement";
import type { Bill } from "../entities/bill";
import type { SourceDocument } from "../entities/document";
import type { PendingAction } from "../entities/action";
import type { Household, Helper } from "../entities/people";
import type { PaymentRecord } from "../entities/payment";
import type { HelperNote, OutboundMessage, Session, Turn } from "../entities/records";
import type { BillStatus, PendingActionStatus } from "../enums";
import type { ActionRef, Id, MonthKey } from "../primitives";

export const StoredEntity = {
  HOUSEHOLD: "HOUSEHOLD",
  HELPER: "HELPER",
  TERM: "TERM",
  BILL: "BILL",
  ACTION: "ACTION",
  MESSAGE: "MESSAGE",
  NOTE: "NOTE",
  DOCUMENT: "DOCUMENT",
  SESSION: "SESSION",
  TURN: "TURN",
  PAYMENT: "PAYMENT",
} as const;
export type StoredEntity = (typeof StoredEntity)[keyof typeof StoredEntity];

export type StoreRecord =
  | { entity: typeof StoredEntity.HOUSEHOLD; value: Household }
  | { entity: typeof StoredEntity.HELPER; value: Helper }
  | { entity: typeof StoredEntity.TERM; value: AgreementTerm }
  | { entity: typeof StoredEntity.BILL; value: Bill }
  | { entity: typeof StoredEntity.ACTION; value: PendingAction }
  | { entity: typeof StoredEntity.MESSAGE; value: OutboundMessage }
  | { entity: typeof StoredEntity.NOTE; value: HelperNote }
  | { entity: typeof StoredEntity.DOCUMENT; value: SourceDocument }
  | { entity: typeof StoredEntity.SESSION; value: Session }
  | { entity: typeof StoredEntity.TURN; value: Turn }
  | { entity: typeof StoredEntity.PAYMENT; value: PaymentRecord };

export const WriteConditionKind = {
  /** Create: fails if a record with this identity exists. */
  ABSENT: "ABSENT",
  /** Update: fails unless the stored version equals `expected`. */
  VERSION: "VERSION",
} as const;

export type WriteCondition =
  | { kind: typeof WriteConditionKind.ABSENT }
  | { kind: typeof WriteConditionKind.VERSION; expected: number };

export type WriteOp = { record: StoreRecord; condition: WriteCondition };

export type BillFilter = { helperId?: Id; month?: MonthKey; status?: BillStatus };
export type ActionFilter = { status?: PendingActionStatus; targetKey?: string };

export interface Store {
  getHousehold(): Promise<Household | null>;

  getHelper(helperId: Id): Promise<Helper | null>;
  listHelpers(): Promise<Helper[]>;

  getTerm(termId: Id): Promise<AgreementTerm | null>;
  /** All versions (current, closed, future-dated), ordered by effectiveFrom. */
  listTerms(filter?: { helperId?: Id }): Promise<AgreementTerm[]>;

  getBill(billId: Id): Promise<Bill | null>;
  /** `month` matches bills whose period.start falls in that month. Ordered by period.start, then receivedAt, then billId. */
  listBills(filter?: BillFilter): Promise<Bill[]>;

  getAction(ref: ActionRef): Promise<PendingAction | null>;
  /** Ordered by ref ascending. */
  listActions(filter?: ActionFilter): Promise<PendingAction[]>;
  /** Atomic counter for short action refs. Never reuses a value. */
  nextActionRef(): Promise<ActionRef>;

  getMessage(messageId: Id): Promise<OutboundMessage | null>;
  listMessages(filter?: { helperId?: Id }): Promise<OutboundMessage[]>;

  listNotes(filter?: { helperId?: Id }): Promise<HelperNote[]>;

  /** Ordered by paidOn. */
  listPayments(filter?: { helperId?: Id; billId?: Id }): Promise<PaymentRecord[]>;

  getDocument(docId: Id): Promise<SourceDocument | null>;

  getSession(sessionId: Id): Promise<Session | null>;
  /** Most recently active first. */
  listSessions(): Promise<Session[]>;

  getTurn(turnId: Id): Promise<Turn | null>;
  /** Oldest first. */
  listTurns(sessionId: Id): Promise<Turn[]>;

  /** Applies every op or none. Throws StoreCommitError on any failed condition or invariant. */
  commit(ops: WriteOp[]): Promise<void>;
}
