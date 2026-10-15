/**
 * The mock's stand-in for the agent: a few scripted replies so the chat screen,
 * turn polling and inline cards can be exercised without a model. It only ever
 * proposes (PENDING cards), like the real agent; nothing is committed here.
 *
 * Call site: handlers/chat.ts, when a turn completes.
 */
import { BillPeriodKind, BillStatus, BillVerdict, HelperStatus, HouseKeyAccess, LineStatus, MessageReason } from "@helper-assistant/domain";
import type { Bill, BillingPeriod, Helper, LineItem, PendingAction } from "@helper-assistant/domain";
import { firstDayOf, lastDayOf, monthOf, mostRecentClosedMonth } from "../lib/months";
import { formatCents, formatDate, formatPeriod } from "../ui/format";
import { addMessageAction } from "./actionFactory";
import type { ActionSource } from "./actionFactory";
import type { MockWorld } from "./world";

export type ScriptedReply = { replyText: string; proposed: PendingAction[] };

const ASKS_FOR_REMINDER = /remind|where|final bill|hasn't|haven't|missing/i;
const ASKS_ABOUT_BILL = /ask|message|draft|bill|text/i;

const PREVIEW_NOTE =
  "This preview runs on sample data, without the real assistant. Try “Draft a reminder for Marco”, “Ask Lupe about her September bill”, or “Lupe's last day is Oct 14” in the right scenario.";

function mentionedHelper(world: MockWorld, text: string): Helper | null {
  const lower = text.toLowerCase();
  return world.helpers.find((h) => lower.includes(h.name.toLowerCase())) ?? null;
}

function openFlaggedBill(world: MockWorld, helper: Helper): Bill | null {
  return (
    world.bills.find(
      (b) => b.helperId === helper.helperId && b.status === BillStatus.RECEIVED && b.latestCheck !== null && b.latestCheck.verdict !== BillVerdict.CHECKS_OUT,
    ) ?? null
  );
}

/** The period a reminder is about: the final partial period for an ended helper, else last month. */
function reminderPeriod(world: MockWorld, helper: Helper): BillingPeriod {
  if (helper.status === HelperStatus.ENDED && helper.endedOn !== null) {
    return { start: firstDayOf(monthOf(helper.endedOn)), end: helper.endedOn, kind: BillPeriodKind.FINAL_SETTLEMENT };
  }
  const month = mostRecentClosedMonth(world.today);
  return { start: firstDayOf(month), end: lastDayOf(month), kind: BillPeriodKind.CALENDAR_MONTH };
}

const lineName = (line: LineItem): string => (line.serviceDate === null ? line.label : formatDate(line.serviceDate));

/** One plain sentence per problem, for the drafted message. */
function problemSentences(bill: Bill): string[] {
  const check = bill.latestCheck!;
  const lines = new Map(bill.lineItems.map((l) => [l.lineId, l]));
  const sentences = check.lineChecks.flatMap((lc) => {
    const line = lines.get(lc.lineId)!;
    if (lc.status === LineStatus.DIFFERS) return [`${lineName(line)} shows ${formatCents(lc.billedCents)}, but we'd agreed ${formatCents(lc.expectedCents!)}`];
    if (lc.status === LineStatus.NOT_COVERED) return [`I don't have the ${line.label} (${formatCents(lc.billedCents)}) in what we agreed`];
    if (lc.status === LineStatus.CANNOT_COMPUTE) return [`I wasn't sure how ${line.label} on ${lineName(line)} was priced`];
    return [];
  });
  if (check.statedTotalCents !== null && check.statedTotalCents !== check.sumOfLinesCents) {
    sentences.push(`the total says ${formatCents(check.statedTotalCents)} but the lines add up to ${formatCents(check.sumOfLinesCents)}`);
  }
  return sentences;
}

function draftReminder(world: MockWorld, helper: Helper, source: ActionSource): ScriptedReply {
  const period = reminderPeriod(world, helper);
  const final = period.kind === BillPeriodKind.FINAL_SETTLEMENT;
  const keyLine = final && helper.houseKeyAccess === HouseKeyAccess.HAS_KEY ? " And could you leave the house key next time you're by?" : "";
  const body = final
    ? `Hi ${helper.name}, thank you so much for everything! Could you send a final bill for ${formatDate(period.start)} to ${formatDate(period.end)}?${keyLine} Thanks!`
    : `Hi ${helper.name}! Whenever you get a chance, could you send your bill for ${formatPeriod(period)}? Thanks!`;
  const action = addMessageAction(world, helper, final ? MessageReason.FINAL_SETTLEMENT : MessageReason.MISSING_BILL, body, { bill: null, period }, source);
  return {
    replyText: `I drafted a ${final ? "final-bill request" : "reminder"} for ${helper.name} (card #${action.ref}). Edit it if you like, then confirm. I won't send it: you copy it or open it in Messages.`,
    proposed: [action],
  };
}

function draftDiscrepancy(world: MockWorld, helper: Helper, bill: Bill, source: ActionSource): ScriptedReply {
  const problems = problemSentences(bill);
  const body = `Hi ${helper.name}, thanks for the ${formatPeriod(bill.period)} bill! ${problems.map((p) => p[0]!.toUpperCase() + p.slice(1)).join(". ")}. Could you take a look and send a corrected bill? Thanks!`;
  const action = addMessageAction(world, helper, MessageReason.DISCREPANCY, body, { bill, period: bill.period }, source);
  return {
    replyText: `I drafted a message to ${helper.name} about the ${problems.length === 1 ? "problem" : `${problems.length} problems`} on the ${formatPeriod(bill.period)} bill (card #${action.ref}). Edit it, then confirm. When a corrected bill comes, drop it here and I'll check it again.`,
    proposed: [action],
  };
}

export function scriptedReply(world: MockWorld, input: { text: string; attachmentDocIds: string[] }, source: ActionSource): ScriptedReply {
  if (input.attachmentDocIds.length > 0) {
    return {
      replyText: `I saved ${input.attachmentDocIds.length === 1 ? "the document" : `${input.attachmentDocIds.length} documents`}. ${PREVIEW_NOTE}`,
      proposed: [],
    };
  }
  const helper = mentionedHelper(world, input.text);
  if (helper !== null && ASKS_FOR_REMINDER.test(input.text)) return draftReminder(world, helper, source);
  if (helper !== null && ASKS_ABOUT_BILL.test(input.text)) {
    const bill = openFlaggedBill(world, helper);
    if (bill !== null) return draftDiscrepancy(world, helper, bill, source);
    return { replyText: `${helper.name} has no flagged bill waiting on you, so there's nothing to ask about. ${PREVIEW_NOTE}`, proposed: [] };
  }
  return { replyText: PREVIEW_NOTE, proposed: [] };
}
