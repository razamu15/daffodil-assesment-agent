/**
 * Terminal rendering of a turn: the reply, then its trace (model calls, tool
 * calls with a short view of input and outcome, proposed cards). Long values
 * are clipped; the full trace is on the Turn record.
 *
 * Call sites: scripts/cli.ts, scripts/scenarios.
 */
import type { Store, ToolResult, Turn } from "@helper-assistant/domain";

const CLIP = 160;
const clip = (text: string) => (text.length <= CLIP ? text : `${text.slice(0, CLIP - 1)}…`);

export function formatTrace(turn: Turn): string {
  const lines = turn.modelCalls.map((c) => `  model  ${c.purpose.padEnd(10)} ${c.stopReason.padEnd(13)} in=${c.inputTokens} out=${c.outputTokens} ${Math.round(c.durationMs)}ms`);
  for (const call of turn.toolCalls) {
    const result = call.output as ToolResult<unknown>;
    const outcome = result.ok ? "ok" : `${result.error.code}: ${result.error.message}`;
    lines.push(`  tool   ${call.name} ${clip(JSON.stringify(call.input))}`, `         → ${clip(outcome)}`);
  }
  return lines.join("\n");
}

export async function formatTurn(turn: Turn, store: Store): Promise<string> {
  const parts = [turn.status === "COMPLETED" ? `assistant> ${turn.replyText}` : `assistant> [${turn.status}] ${turn.error}`];
  parts.push("--- trace", formatTrace(turn));
  for (const ref of turn.proposedActionRefs) {
    const action = await store.getAction(ref);
    if (action !== null) parts.push(`  card   #${action.ref} ${action.type} ${action.status}: ${action.summary}`);
  }
  return parts.join("\n");
}
