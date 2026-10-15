/**
 * What the model is told about each tool. The domain owns names, categories and
 * input schemas; the words are the agent's. Record<ToolName, …> makes a missing
 * or extra description a type error.
 *
 * Call site: the tool registry (ModelToolSpec.description).
 */
import type { ToolName } from "@helper-assistant/domain";

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  // READ
  list_helpers: "List every helper: profile (role, status, key access, payment, contact) and the service keys their terms use.",
  list_agreements:
    "Agreement terms for one helper, each with its source document kind, precedence rank (1 = most reliable) and quote, plus open notes for terms that couldn't be encoded. asOf = a date returns only terms in effect that day; asOf null returns every version (current, closed and future-dated).",
  list_bills: "List bills with status, period, stated total, sum of lines and verdict. Every filter is optional (null = no filter). month is YYYY-MM and matches the period start.",
  get_bill: "One bill with every line (lineIds, times, amounts, the helper's quotes) and its latest check.",
  check_bill:
    "Run the deterministic checker on a bill now: verdict, line-by-line status with the expected amount and why, and bill findings. This is the only source of truth for whether a bill is right. Read-only.",
  get_month_status:
    "Derived status per helper for a month (YYYY-MM): not received, received, checked ok / needs info / flagged, approved, paid, and when the helper was last asked. month null = the most recent closed month.",
  list_pending_actions: "Proposals waiting on Jordan (or resolved ones, by status). status null = every status.",
  extract_from_document:
    "Read an uploaded document (or Jordan's message this turn, by its document id) into structured data, in a separate, sandboxed call. extractionKind AGREEMENT for notes and threads, BILL for a bill. Returns a draft with null for anything unstated, assumptions, source quotes, and helperMatches (name → helperId, null if unknown). Nothing is saved. Bills can't be read as agreements.",

  // RECORD
  save_helper:
    "Create (helperId null) or update a helper's profile. Saved immediately, no confirmation. For an update pass the complete profile (read it with list_helpers first). Does not change status; ending an engagement is propose_engagement_end.",
  record_bill:
    "Save a bill exactly as the helper wrote it (from extract_from_document) and check it in the same call. Returns the saved bill with lineIds and the check. Replaces an earlier unapproved bill for the same helper and period. A bill for a period that is already approved is refused (PERIOD_ALREADY_APPROVED) and nothing is saved. Records the claim only; it approves nothing.",

  // PROPOSE
  propose_agreement_change:
    "Propose adding (ADD_TERM), replacing (REPLACE_TERM) or ending (END_TERM) an agreement term. Creates a pending card Jordan must confirm in the app; nothing changes before that. A rate change for an existing service is REPLACE_TERM of its current term. Amounts in cents. Returns NEEDS_DECISION with conflicts when other pending proposals target the same service.",
  propose_bill_approval:
    "Propose approving a bill for payment. Jordan confirms in the app. Every DISCREPANCY or NEEDS_INFO line or finding must be listed in acceptedExceptions with Jordan's own reason (e.g. after 'talked to Priya, the bill is correct'). The amount approved is always the sum of the lines, never the stated total.",
  propose_helper_message:
    "Draft a message to a helper (a discrepancy, a missing bill, a final settlement). Jordan edits, confirms and sends it themselves; this never sends anything.",
  propose_engagement_end:
    "Propose ending a helper's engagement on a date. Jordan confirms in the app. A final bill is then expected for the partial month. Returns reminders (e.g. the helper has a key).",
  withdraw_pending_action: "Withdraw a pending proposal by its #ref, with a reason (e.g. Jordan changed their mind). Only reduces what could happen.",

  // ESCAPE
  save_unstructured_note:
    "Store something agreed that the pricing rules can't express (a minimum, a per-child extra). Lines that depend on it can't be checked automatically, and you should say so.",
  flag_for_review: "Flag a gap or doubt for Jordan to look at later (e.g. a bill you can't read, two sources that disagree).",
};
