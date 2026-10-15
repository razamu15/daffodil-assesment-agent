/**
 * The inner loop of one turn (Doc 3 §4.1 step 3): model ⇄ tools until the
 * model answers in text. Tool calls in one model response run in order (they
 * may depend on each other's writes), each through dispatchTool, and every
 * call is traced.
 *
 * What each stop reason means for the loop is a table. Stops that leave no
 * trustworthy answer (cut off, filtered) fail the turn loudly rather than
 * returning half a reply.
 *
 * Call site: runTurn.
 */
import { ModelCallPurpose, ModelRole, ModelStopReason } from "@helper-assistant/domain";
import type { ModelContentBlock, ModelMessage, ModelStopReason as ModelStopReasonT } from "@helper-assistant/domain";
import { tracedConverse } from "../model/tracedModel";
import { AGENT_LOOP_MAX_TOKENS, AGENT_LOOP_TEMPERATURE, MAX_AGENT_LOOP_MODEL_CALLS } from "../settings";
import type { ToolContext } from "../tools/context";
import { dispatchTool, toolSpecs } from "../tools/registry";

const LoopStep = { FINISH: "FINISH", RUN_TOOLS: "RUN_TOOLS", FAIL: "FAIL" } as const;
type LoopStep = (typeof LoopStep)[keyof typeof LoopStep];

const LOOP_STEP_BY_STOP_REASON: Record<ModelStopReasonT, LoopStep> = {
  [ModelStopReason.END_TURN]: LoopStep.FINISH,
  [ModelStopReason.STOP_SEQUENCE]: LoopStep.FINISH,
  /** The guardrail's own message is the reply. */
  [ModelStopReason.GUARDRAIL_INTERVENED]: LoopStep.FINISH,
  [ModelStopReason.TOOL_USE]: LoopStep.RUN_TOOLS,
  [ModelStopReason.MAX_TOKENS]: LoopStep.FAIL,
  [ModelStopReason.CONTENT_FILTERED]: LoopStep.FAIL,
};

/** The turn could not produce an answer. Its message becomes Turn.error. */
export class AgentLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentLoopError";
  }
}

export async function runConverseLoop(ctx: ToolContext, system: string[], messages: ModelMessage[]): Promise<string> {
  for (let call = 0; call < MAX_AGENT_LOOP_MODEL_CALLS; call++) {
    const response = await tracedConverse(
      ctx.deps,
      ModelCallPurpose.AGENT_LOOP,
      { system, messages, tools: toolSpecs, toolChoice: { type: "auto" }, maxTokens: AGENT_LOOP_MAX_TOKENS, temperature: AGENT_LOOP_TEMPERATURE },
      ctx.trace.modelCalls,
    );
    messages.push(response.message);
    const step = LOOP_STEP_BY_STOP_REASON[response.stopReason];

    if (step === LoopStep.FAIL) throw new AgentLoopError(`The model stopped without a usable answer (${response.stopReason}).`);
    if (step === LoopStep.FINISH) {
      const reply = textOf(response.message.content);
      if (reply === "") throw new AgentLoopError(`The model finished (${response.stopReason}) without any text.`);
      return reply;
    }

    const toolUses = response.message.content.filter((b): b is Extract<ModelContentBlock, { type: "toolUse" }> => b.type === "toolUse");
    if (toolUses.length === 0) throw new AgentLoopError("The model asked to use tools but named none.");
    const results: ModelContentBlock[] = [];
    for (const toolUse of toolUses) results.push(await runTool(ctx, toolUse));
    messages.push({ role: ModelRole.USER, content: results });
  }
  throw new AgentLoopError(`The turn used ${MAX_AGENT_LOOP_MODEL_CALLS} model calls without finishing.`);
}

async function runTool(ctx: ToolContext, toolUse: Extract<ModelContentBlock, { type: "toolUse" }>): Promise<ModelContentBlock> {
  const startedAt = ctx.deps.clock.now();
  const started = performance.now();
  const result = await dispatchTool(toolUse.name, toolUse.input, ctx);
  ctx.trace.toolCalls.push({
    toolUseId: toolUse.toolUseId,
    name: toolUse.name,
    input: toolUse.input,
    output: result,
    isError: !result.ok,
    startedAt,
    durationMs: performance.now() - started,
  });
  return { type: "toolResult", toolUseId: toolUse.toolUseId, content: [{ type: "json", json: result }], status: result.ok ? "success" : "error" };
}

const textOf = (content: ModelContentBlock[]): string =>
  content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
