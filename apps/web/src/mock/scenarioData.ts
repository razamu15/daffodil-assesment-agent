/**
 * Scenario records the fixtures don't have: a helper with no bill, pending
 * actions, approvals and payments, an engagement end. Every value is written
 * out explicitly; ids carry "mock" so they can't be mistaken for fixture data.
 */
import {
  ActionBasisKind,
  AgreementChangeKind,
  BillPeriodKind,
  ChatRole,
  ContactChannel,
  DayOfWeek,
  DocumentKind,
  DocumentStorage,
  ExceptionTarget,
  BillFindingKind,
  HelperStatus,
  HouseKeyAccess,
  MessageReason,
  MessageStatus,
  NoteKind,
  NoteStatus,
  PaymentMethod,
  PendingActionType,
  PricingRuleKind,
  ScheduleKind,
  targetKeys,
} from "@helper-assistant/domain";
import type { DocumentKind as DocumentKindT, SourceDocument, TermContent } from "@helper-assistant/domain";
import { billIds, helperIds, priyaLineIds, serviceKeys, termIds } from "@helper-assistant/fixtures";
import { addAction, addApprovalAction, addMessageAction, NO_SOURCE } from "./actionFactory";
import { confirmInWorld } from "./apply";
import { addSession } from "./starterWorld";
import type { MockWorld } from "./world";

function addTextDocument(world: MockWorld, docId: string, kind: DocumentKindT, text: string, sessionId: string | null): SourceDocument {
  const doc: SourceDocument = { docId, kind, content: { storage: DocumentStorage.INLINE_TEXT, text }, messageDate: null, receivedAt: world.now(), sessionId };
  world.documents.push(doc);
  return doc;
}

/** month-mixed: a fourth helper whose September bill hasn't come. */
export function addMarcoWithoutBill(world: MockWorld): void {
  const helperId = "helper-marco-mock";
  world.helpers.push({
    helperId,
    name: "Marco",
    role: "tutor",
    status: HelperStatus.ACTIVE,
    startedOn: "2026-09-01",
    endedOn: null,
    houseKeyAccess: HouseKeyAccess.NO_KEY,
    payment: { method: PaymentMethod.ZELLE, handle: null },
    contact: { channel: ContactChannel.SMS, handle: null },
    notes: "Math tutoring for Maya.",
    version: 1,
  });
  const doc = addTextDocument(world, "doc-mock-marco-start", DocumentKind.CHAT_STATEMENT, "Marco started tutoring Maya on Sep 1: $45 an hour, Thursdays after school.", null);
  world.terms.push({
    termId: "term-mock-marco-tutoring",
    helperId,
    serviceKey: "tutoring",
    serviceLabel: "Tutoring",
    pricingRules: [{ kind: PricingRuleKind.HOURLY, amountCents: 4500 }],
    schedule: { kind: ScheduleKind.WEEKLY_ON, days: [DayOfWeek.THU] },
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    sourceDocId: doc.docId,
    sourceQuote: "$45 an hour, Thursdays after school",
    assumptions: ["Start date Sep 1, 2026 taken from your message."],
    supersedesTermId: null,
    createdByActionRef: 11,
    createdAt: world.now(),
    version: 1,
  });
}

const lupeRegular150Term = (world: MockWorld) => world.terms.find((t) => t.termId === termIds.lupeRegular150)!;

/** pending-conflict: two proposals for Lupe's regular rate from November that disagree, plus an unrelated draft. */
export function addConflictingProposals(world: MockWorld): void {
  const current = lupeRegular150Term(world);
  const basis = { kind: ActionBasisKind.TERM_SLOT, helperId: helperIds.lupe, serviceKey: serviceKeys.lupeRegular, currentTermId: current.termId, currentTermVersion: current.version } as const;
  const replacement = (amountCents: number, sourceDocId: string, sourceQuote: string, assumptions: string[]): TermContent => ({
    helperId: helperIds.lupe,
    serviceKey: serviceKeys.lupeRegular,
    serviceLabel: current.serviceLabel,
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "VISIT", amountCents }],
    schedule: current.schedule,
    effectiveFrom: "2026-11-01",
    effectiveTo: null,
    sourceDocId,
    sourceQuote,
    assumptions,
  });

  const said = addTextDocument(world, "doc-mock-lupe-155", DocumentKind.CHAT_STATEMENT, "Lupe goes to $155 in November.", null);
  const thread = addTextDocument(
    world,
    "doc-mock-lupe-160-thread",
    DocumentKind.PASTED_THREAD,
    "[Copied from Jordan's phone, thread with Lupe]\n\nLupe (Mon Oct 12, 8:02 AM): Hi Jordan! From November my regular visit will be $160. Deep clean stays $220 🙂",
    null,
  );
  const sessionId = addSession(world, "Lupe's November rate", [
    [ChatRole.USER, "Lupe goes to $155 in November."],
    [ChatRole.ASSISTANT, "Got it. I've proposed changing Lupe's regular cleaning to $155 a visit from Nov 1. Please confirm."],
    [ChatRole.USER, "Here's the text where she told me."],
    [
      ChatRole.ASSISTANT,
      "This text says $160 from November, not $155. I've proposed that too. Both change the same agreement, so confirm the one that's right and reject the other.",
    ],
  ]);
  const fields = (summary: string) => ({ targetKey: targetKeys.termSlot(helperIds.lupe, serviceKeys.lupeRegular), basedOn: basis, summary });

  const t155 = replacement(15500, said.docId, said.content.storage === DocumentStorage.INLINE_TEXT ? said.content.text : "", ["'November' read as from Nov 1, 2026."]);
  addAction(world, PendingActionType.AGREEMENT_CHANGE, { change: AgreementChangeKind.REPLACE_TERM, supersedesTermId: current.termId, term: t155 }, { ...fields("Lupe: regular cleaning $150 → $155 a visit from Nov 1"), assumptions: t155.assumptions }, { sessionId, turnId: null, docId: said.docId });

  const t160 = replacement(16000, thread.docId, "From November my regular visit will be $160.", ["'From November' read as from Nov 1, 2026.", "The thread is dated Mon Oct 12, so 'November' is November 2026."]);
  addAction(world, PendingActionType.AGREEMENT_CHANGE, { change: AgreementChangeKind.REPLACE_TERM, supersedesTermId: current.termId, term: t160 }, { ...fields("Lupe: regular cleaning $150 → $160 a visit from Nov 1"), assumptions: t160.assumptions }, { sessionId, turnId: null, docId: thread.docId });

  const priyaBill = world.bill(billIds.priya);
  addMessageAction(
    world,
    world.helper(helperIds.priya),
    MessageReason.DISCREPANCY,
    "Hi Priya, thanks for the September bill! I don't have the last minute fee ($40) in what we agreed, and the total says $626 but the lines add up to $596. Could you take a look and send a corrected bill? Thanks!",
    { bill: priyaBill, period: priyaBill.period },
    NO_SOURCE,
  );
}

/** approved: Theo approved and paid; Priya approved with accepted exceptions; a corrected Priya bill refused (S1); Lupe asked. */
export function addApprovalsAndRefusal(world: MockWorld): void {
  const theoBill = world.bill(billIds.theo);
  confirmInWorld(world, addApprovalAction(world, theoBill, world.helper(helperIds.theo), [], NO_SOURCE), null);
  const theoApproved = world.bill(billIds.theo);
  world.payments.push({
    paymentId: `payment-${billIds.theo}`,
    billId: billIds.theo,
    helperId: helperIds.theo,
    amountCents: theoApproved.approval!.amountApprovedCents,
    paidOn: "2026-10-14",
    method: PaymentMethod.VENMO,
    note: "Venmo, sent from Jordan's phone",
    recordedAt: world.now(),
    version: 1,
  });

  const priyaExceptions = [
    { target: ExceptionTarget.LINE, lineId: priyaLineIds.fee, reason: "Sam really did OK the same-day fee." },
    { target: ExceptionTarget.FINDING, findingKind: BillFindingKind.TOTAL_MISMATCH, reason: "Priya mis-added the total. Paying the sum of the lines." },
  ];
  confirmInWorld(world, addApprovalAction(world, world.bill(billIds.priya), world.helper(helperIds.priya), priyaExceptions, NO_SOURCE), null);

  const lupe = world.helper(helperIds.lupe);
  const lupeBill = world.bill(billIds.lupe);
  const asked = addMessageAction(
    world,
    lupe,
    MessageReason.DISCREPANCY,
    "Hi Lupe, thanks for September's bill. Sep 1 and 8 show $150, but the new rate started Sep 15 (we had $140 before). Could you send a corrected total of $800? Thanks!",
    { bill: lupeBill, period: lupeBill.period },
    NO_SOURCE,
  );
  confirmInWorld(world, asked, null);
  const ready = world.messages.at(-1)!;
  world.replace(world.messages, (m) => m.messageId === ready.messageId, { ...ready, status: MessageStatus.HANDED_OFF, handedOffAt: world.now(), version: ready.version + 1 });

  const corrected = addTextDocument(
    world,
    "doc-mock-priya-corrected-bill",
    DocumentKind.BILL_TEXT,
    "[Copied from Jordan's phone, text from Priya]\n\nSorry, I added wrong! Corrected September total: $596",
    null,
  );
  const sessionId = addSession(world, "Priya's corrected bill", [
    [ChatRole.USER, "Priya sent a corrected September bill."],
    [
      ChatRole.ASSISTANT,
      "September is already approved for Priya ($596, with the $40 fee and her total accepted as exceptions). I didn't record this new bill: an approved bill stays sealed, so a second one can't quietly replace it or get paid twice. Her corrected total matches what you approved, so there's nothing else to do.",
    ],
  ]);
  world.documents = world.documents.map((d) => (d.docId === corrected.docId ? { ...d, sessionId } : d));
  world.notes.push({
    noteId: "note-mock-priya-corrected",
    noteKind: NoteKind.REVIEW_FLAG,
    helperId: helperIds.priya,
    billId: billIds.priya,
    text: "Priya sent a corrected September bill after September was approved. It was not recorded: the approved bill stays as it is.",
    sourceDocId: corrected.docId,
    status: NoteStatus.OPEN,
    createdAt: world.now(),
    version: 1,
  });
}

/** helper-ended: Jordan said Lupe's last day is Oct 14; the engagement end waits for confirmation. Returns the chat to open. */
export function addLupeEngagementEnd(world: MockWorld): string {
  const lupe = world.helper(helperIds.lupe);
  const said = addTextDocument(world, "doc-mock-lupe-last-day", DocumentKind.CHAT_STATEMENT, "Lupe's last day is Oct 14. We're switching cleaners.", null);
  const sessionId = addSession(world, "Lupe's last day", [
    [ChatRole.USER, "Lupe's last day is Oct 14. We're switching cleaners."],
    [
      ChatRole.ASSISTANT,
      "I've proposed ending Lupe's engagement on Oct 14. Lupe has a key to the house, so remember to get it back. Once you confirm, I'll expect a final bill for Oct 1 – Oct 14 and can draft the request to her. Her September bill is still waiting on you as well.",
    ],
  ]);
  addAction(
    world,
    PendingActionType.HELPER_ENGAGEMENT_END,
    { helperId: lupe.helperId, endedOn: "2026-10-14", finalPeriod: { start: "2026-10-01", end: "2026-10-14", kind: BillPeriodKind.FINAL_SETTLEMENT }, houseKeyAccess: lupe.houseKeyAccess },
    {
      targetKey: targetKeys.helper(lupe.helperId),
      basedOn: { kind: ActionBasisKind.HELPER_VERSION, helperId: lupe.helperId, version: lupe.version },
      summary: "Lupe: last day Oct 14. Expect a final bill for Oct 1 – Oct 14",
      assumptions: ["'Oct 14' read as Oct 14, 2026 (today).", "The final bill covers Oct 1 – Oct 14; September is billed on its own."],
    },
    { sessionId, turnId: null, docId: said.docId },
  );
  return sessionId;
}
