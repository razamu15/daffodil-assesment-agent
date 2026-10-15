/**
 * MockWorld: the in-memory "database" one scenario starts from. Handlers read
 * and mutate it; switching scenario builds a fresh one.
 *
 * Lookups that the real API reports as NOT_FOUND throw MockApiError here, so
 * handlers stay short.
 */
import { ApiErrorCode } from "@helper-assistant/domain";
import { STARTER_PACK_TODAY } from "@helper-assistant/fixtures";
import type {
  ActionRef,
  AgreementTerm,
  Bill,
  ChatMessage,
  Helper,
  HelperNote,
  Id,
  Instant,
  LocalDate,
  OutboundMessage,
  PaymentRecord,
  PendingAction,
  Session,
  SourceDocument,
  TurnView,
} from "@helper-assistant/domain";
import { MockApiError } from "./errors";

/** A chat turn in flight. The scripted reply is produced once, when the turn is first polled after readyAtMs. */
export type MockTurn = {
  view: TurnView;
  /** Wall-clock ms (Date.now) after which the turn completes. */
  readyAtMs: number;
  input: { text: string; attachmentDocIds: Id[] };
};

/** Minutes past this instant are handed out as "now", so every write gets a distinct, ordered timestamp. */
const MOCK_CLOCK_START_MS = Date.parse(`${STARTER_PACK_TODAY}T17:00:00.000Z`);

export class MockWorld {
  helpers: Helper[] = [];
  terms: AgreementTerm[] = [];
  notes: HelperNote[] = [];
  documents: SourceDocument[] = [];
  /** Image bytes (base64) for BLOB documents, by docId. */
  blobs = new Map<Id, string>();
  bills: Bill[] = [];
  payments: PaymentRecord[] = [];
  actions: PendingAction[] = [];
  messages: OutboundMessage[] = [];
  sessions: Session[] = [];
  chat = new Map<Id, ChatMessage[]>();
  turns = new Map<Id, MockTurn>();

  readonly today: LocalDate = STARTER_PACK_TODAY;
  private minutes = 0;
  private ids = 0;

  /** A fresh instant on the mock's fixed day; each call is one minute later. */
  now(): Instant {
    this.minutes += 1;
    return new Date(MOCK_CLOCK_START_MS + this.minutes * 60_000).toISOString();
  }

  newId(prefix: string): Id {
    this.ids += 1;
    return `${prefix}-mock-${this.ids}`;
  }

  nextActionRef(): ActionRef {
    // Fixture terms cite the refs that created them (#4–#10); new cards never reuse those numbers.
    return Math.max(0, ...this.actions.map((a) => a.ref), ...this.terms.map((t) => t.createdByActionRef)) + 1;
  }

  helper(helperId: Id): Helper {
    return this.helpers.find((h) => h.helperId === helperId) ?? notFound("Helper", helperId);
  }

  bill(billId: Id): Bill {
    return this.bills.find((b) => b.billId === billId) ?? notFound("Bill", billId);
  }

  document(docId: Id): SourceDocument {
    return this.documents.find((d) => d.docId === docId) ?? notFound("Document", docId);
  }

  action(ref: ActionRef): PendingAction {
    return this.actions.find((a) => a.ref === ref) ?? notFound("Action", ref);
  }

  session(sessionId: Id): Session {
    return this.sessions.find((s) => s.sessionId === sessionId) ?? notFound("Chat", sessionId);
  }

  /** Replace a record in one of the arrays by its id field. */
  replace<T>(list: T[], matches: (item: T) => boolean, next: T): void {
    const index = list.findIndex(matches);
    if (index === -1) throw new MockApiError(ApiErrorCode.INTERNAL, "Mock tried to replace a record that isn't there.");
    list[index] = next;
  }
}

function notFound(what: string, id: Id | number): never {
  throw new MockApiError(ApiErrorCode.NOT_FOUND, `${what} ${id} not found.`);
}
