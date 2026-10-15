/**
 * FakeModel: the scripted ModelClient for tests (Doc 4 §2 seam). Each converse()
 * call takes the next step of the script; a step is a fixed response or a
 * function of the request (to answer from what the tools returned). Every
 * request is kept for assertions. Running past the end of the script throws:
 * an unexpected extra model call is a test failure, not a silent default.
 *
 * Call sites: agent tests; apps/local-server may use it for offline demos.
 */
import { ModelRole, ModelStopReason } from "@helper-assistant/domain";
import type { ModelClient, ModelContentBlock, ModelRequest, ModelResponse } from "@helper-assistant/domain";

export type FakeModelStep = ModelResponse | ((request: ModelRequest) => ModelResponse);

const FAKE_USAGE = { inputTokens: 100, outputTokens: 20 };

export class FakeModel implements ModelClient {
  readonly requests: ModelRequest[] = [];
  private next = 0;

  constructor(private readonly script: FakeModelStep[]) {}

  async converse(request: ModelRequest): Promise<ModelResponse> {
    // Snapshot: the loop keeps appending to the same messages array.
    this.requests.push(structuredClone(request));
    const step = this.script[this.next++];
    if (step === undefined) throw new Error(`FakeModel script ran out after ${this.script.length} call(s)`);
    return typeof step === "function" ? step(request) : step;
  }

  /** True when every scripted step was used. */
  get exhausted(): boolean {
    return this.next === this.script.length;
  }

  /** A final text answer. */
  static text(text: string): ModelResponse {
    return { stopReason: ModelStopReason.END_TURN, message: { role: ModelRole.ASSISTANT, content: [{ type: "text", text }] }, usage: FAKE_USAGE };
  }

  /** One or more tool calls in one response. Ids are generated unless given. */
  static toolUse(...calls: { name: string; input: unknown; toolUseId?: string }[]): ModelResponse {
    const content: ModelContentBlock[] = calls.map((c, i) => ({ type: "toolUse", toolUseId: c.toolUseId ?? `tu-${c.name}-${i}`, name: c.name, input: c.input }));
    return { stopReason: ModelStopReason.TOOL_USE, message: { role: ModelRole.ASSISTANT, content }, usage: FAKE_USAGE };
  }

  /** Any response with a given stop reason, for loop edge cases. */
  static stopped(stopReason: ModelResponse["stopReason"], content: ModelContentBlock[] = []): ModelResponse {
    return { stopReason, message: { role: ModelRole.ASSISTANT, content }, usage: FAKE_USAGE };
  }
}

/** The ToolResult envelopes in the latest user message of a request (what the tools just returned). */
export function lastToolResults(request: ModelRequest): { toolUseId: string; result: unknown }[] {
  const last = request.messages.at(-1);
  if (last === undefined) return [];
  return last.content.flatMap((b) =>
    b.type === "toolResult" ? [{ toolUseId: b.toolUseId, result: b.content.find((c) => c.type === "json")?.json ?? null }] : [],
  );
}
