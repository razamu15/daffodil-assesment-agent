/**
 * PROPOSE tools: each writes a PENDING action through core's pipeline and
 * nothing real changes until Jordan confirms in the UI. Conflicts come back in
 * the result (NEEDS_DECISION) for the model to explain; code never picks one.
 * withdraw_pending_action is the one resolution the agent may make: it only
 * reduces what could happen.
 *
 * Call site: the tool registry.
 */
import {
  proposeAgreementChange,
  proposeBillApproval,
  proposeEngagementEnd,
  proposeHelperMessage,
  withdrawAction,
} from "@helper-assistant/core";
import { AgreementChangeKind, TERM_SOURCE_DOCUMENT_KINDS } from "@helper-assistant/domain";
import type { ProposeResult } from "@helper-assistant/domain";
import type { ToolContext, ToolHandlers } from "./context";
import { actionSource } from "./context";
import { requireDocument } from "./documents";

type ProposeHandlers = Pick<
  ToolHandlers,
  "propose_agreement_change" | "propose_bill_approval" | "propose_helper_message" | "propose_engagement_end" | "withdraw_pending_action"
>;

/** A bill is a claim and never defines terms (Doc 3 §3.5). */
const TERM_SOURCE = { allowedKinds: TERM_SOURCE_DOCUMENT_KINDS, why: "a bill is the helper's claim and can't define or end agreement terms." };

function proposed(ctx: ToolContext, result: ProposeResult): ProposeResult {
  ctx.trace.proposedActionRefs.push(result.action.ref);
  return result;
}

export const proposeHandlers: ProposeHandlers = {
  propose_agreement_change: async (input, ctx) => {
    if (input.change.change !== AgreementChangeKind.END_TERM) await requireDocument(ctx, input.change.term.sourceDocId, TERM_SOURCE);
    if (input.sourceDocId !== null) await requireDocument(ctx, input.sourceDocId, TERM_SOURCE);
    return proposed(ctx, await proposeAgreementChange(ctx.deps, input, { sessionId: ctx.sessionId, turnId: ctx.turnId }));
  },

  propose_bill_approval: async (input, ctx) => proposed(ctx, await proposeBillApproval(ctx.deps, input, actionSource(ctx, null))),

  propose_helper_message: async (input, ctx) => proposed(ctx, await proposeHelperMessage(ctx.deps, input, actionSource(ctx, null))),

  propose_engagement_end: async (input, ctx) => proposed(ctx, await proposeEngagementEnd(ctx.deps, input, actionSource(ctx, null))),

  withdraw_pending_action: async (input, { deps }) => ({ action: await withdrawAction(deps, input) }),
};
