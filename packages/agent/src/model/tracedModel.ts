/**
 * One model call with its ModelCallTrace recorded (purpose, stop reason, tokens,
 * timing). Runs aren't reproducible, so the trace is the record.
 *
 * Call sites: the converse loop (AGENT_LOOP) and extraction (EXTRACTION).
 */
import type { Clock, ModelCallPurpose, ModelCallTrace, ModelClient, ModelRequest, ModelResponse } from "@helper-assistant/domain";

export async function tracedConverse(
  { model, clock }: { model: ModelClient; clock: Clock },
  purpose: ModelCallPurpose,
  request: ModelRequest,
  traces: ModelCallTrace[],
): Promise<ModelResponse> {
  const startedAt = clock.now();
  const started = performance.now();
  const response = await model.converse(request);
  traces.push({
    purpose,
    stopReason: response.stopReason,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    startedAt,
    durationMs: performance.now() - started,
  });
  return response;
}
