/**
 * The Store contract's list filters and orderings (domain ports/store.ts), in one
 * place so every Store answers a list query identically. Each store loads the
 * candidate records its own way and hands them here.
 *
 * Every ordering ends on the record's id, so ties never fall back to whatever
 * order a store happened to load records in (DynamoDB Scan has none).
 *
 * Call sites: inMemoryStore.ts, dynamoStore.ts.
 */
import type {
  ActionFilter,
  AgreementTerm,
  Bill,
  BillFilter,
  Helper,
  HelperNote,
  Id,
  OutboundMessage,
  PaymentRecord,
  PendingAction,
  Session,
  Turn,
} from "@helper-assistant/domain";

export const sortHelpers = (helpers: Helper[]): Helper[] => helpers.sort((a, b) => a.name.localeCompare(b.name) || a.helperId.localeCompare(b.helperId));

export const selectTerms = (terms: AgreementTerm[], filter: { helperId?: Id }): AgreementTerm[] =>
  terms
    .filter((t) => filter.helperId === undefined || t.helperId === filter.helperId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt) || a.termId.localeCompare(b.termId));

export const selectBills = (bills: Bill[], filter: BillFilter): Bill[] =>
  bills
    .filter(
      (b) =>
        (filter.helperId === undefined || b.helperId === filter.helperId) &&
        (filter.month === undefined || b.period.start.startsWith(filter.month)) &&
        (filter.status === undefined || b.status === filter.status),
    )
    .sort((a, b) => a.period.start.localeCompare(b.period.start) || a.receivedAt.localeCompare(b.receivedAt) || a.billId.localeCompare(b.billId));

export const selectActions = (actions: PendingAction[], filter: ActionFilter): PendingAction[] =>
  actions
    .filter((a) => (filter.status === undefined || a.status === filter.status) && (filter.targetKey === undefined || a.targetKey === filter.targetKey))
    .sort((a, b) => a.ref - b.ref);

export const selectMessages = (messages: OutboundMessage[], filter: { helperId?: Id }): OutboundMessage[] =>
  messages.filter((m) => filter.helperId === undefined || m.helperId === filter.helperId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.messageId.localeCompare(b.messageId));

export const selectNotes = (notes: HelperNote[], filter: { helperId?: Id }): HelperNote[] =>
  notes.filter((n) => filter.helperId === undefined || n.helperId === filter.helperId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.noteId.localeCompare(b.noteId));

export const selectPayments = (payments: PaymentRecord[], filter: { helperId?: Id; billId?: Id }): PaymentRecord[] =>
  payments
    .filter((p) => (filter.helperId === undefined || p.helperId === filter.helperId) && (filter.billId === undefined || p.billId === filter.billId))
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.paymentId.localeCompare(b.paymentId));

export const sortSessions = (sessions: Session[]): Session[] => sessions.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt) || a.sessionId.localeCompare(b.sessionId));

export const selectTurns = (turns: Turn[], sessionId: Id): Turn[] =>
  turns.filter((t) => t.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.turnId.localeCompare(b.turnId));
