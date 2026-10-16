/**
 * AnthropicModel: a ModelClient over the Claude API (Anthropic Messages API).
 * A local-development stand-in while Bedrock model access is blocked on the
 * account; the brief requires Bedrock for the submitted app, so the deployed
 * Lambdas stay on BedrockModel. Same seam, same request shape: the domain
 * ModelRequest mirrors Converse, and Messages is close to Converse.
 *
 * Like BedrockModel, anything the domain ModelResponse can't represent (an
 * unexpected stop reason or content block) throws instead of being guessed at.
 *
 * Call sites: model/modelProvider.ts (apps/local-server and the agent CLI when
 * MODEL_PROVIDER=anthropic).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ModelStopReason } from "@helper-assistant/domain";
import type {
  ModelClient,
  ModelContentBlock,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStopReason as ModelStopReasonT,
  ModelToolChoice,
} from "@helper-assistant/domain";

/** The one Messages operation AnthropicModel uses. Narrow so tests can fake it without the SDK client. */
export type AnthropicMessagesApi = { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };

export function anthropicMessagesApi(client: Anthropic): AnthropicMessagesApi {
  return { create: (params) => client.messages.create(params) };
}

const TOOL_CHOICE: { [K in ModelToolChoice["type"]]: (choice: Extract<ModelToolChoice, { type: K }>) => Anthropic.ToolChoice } = {
  auto: () => ({ type: "auto" }),
  any: () => ({ type: "any" }),
  tool: (choice) => ({ type: "tool", name: choice.name }),
};

/**
 * Messages stop reasons the domain names. `refusal` is the Claude API's "declined
 * for safety", which the domain (named after Converse) calls content_filtered.
 * pause_turn (server tools) and model_context_window_exceeded throw.
 */
const STOP_REASON_BY_ANTHROPIC: Partial<Record<Anthropic.StopReason, ModelStopReasonT>> = {
  end_turn: ModelStopReason.END_TURN,
  tool_use: ModelStopReason.TOOL_USE,
  max_tokens: ModelStopReason.MAX_TOKENS,
  stop_sequence: ModelStopReason.STOP_SEQUENCE,
  refusal: ModelStopReason.CONTENT_FILTERED,
};

export class AnthropicModel implements ModelClient {
  constructor(
    private readonly api: AnthropicMessagesApi,
    private readonly modelId: string,
  ) {
    if (modelId.trim() === "") throw new Error("AnthropicModel needs a model ID");
  }

  async converse(request: ModelRequest): Promise<ModelResponse> {
    return fromAnthropicMessage(await this.api.create(toAnthropicParams(this.modelId, request)));
  }
}

export function toAnthropicParams(modelId: string, request: ModelRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: modelId,
    max_tokens: request.maxTokens,
    system: request.system.map((text) => ({ type: "text" as const, text })),
    messages: request.messages.map(toAnthropicMessage),
    ...(request.temperature === null ? {} : { temperature: request.temperature }),
    ...(request.tools.length === 0
      ? {}
      : {
          tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
          ...(request.toolChoice === null ? {} : { tool_choice: (TOOL_CHOICE[request.toolChoice.type] as (c: ModelToolChoice) => Anthropic.ToolChoice)(request.toolChoice) }),
        }),
  };
}

function toAnthropicMessage(message: ModelMessage): Anthropic.MessageParam {
  return { role: message.role, content: message.content.map(toAnthropicBlock) };
}

function toAnthropicBlock(block: ModelContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: block.mediaType, data: Buffer.from(block.bytes).toString("base64") } };
    case "toolUse":
      return { type: "tool_use", id: block.toolUseId, name: block.name, input: block.input };
    case "toolResult":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        is_error: block.status === "error",
        // The Messages API has no JSON result block (Converse does); JSON goes as its text.
        content: block.content.map((c) => ({ type: "text" as const, text: c.type === "text" ? c.text : JSON.stringify(c.json) })),
      };
  }
}

export function fromAnthropicMessage(message: Anthropic.Message): ModelResponse {
  const stopReason = message.stop_reason === null ? undefined : STOP_REASON_BY_ANTHROPIC[message.stop_reason];
  if (stopReason === undefined) throw new Error(`Claude API stop reason "${message.stop_reason}" has no domain equivalent`);
  return {
    stopReason,
    message: { role: "assistant", content: message.content.map(fromAnthropicBlock) },
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}

function fromAnthropicBlock(block: Anthropic.ContentBlock): ModelContentBlock {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "tool_use") return { type: "toolUse", toolUseId: block.id, name: block.name, input: block.input };
  throw new Error(`Claude API returned a content block the agent doesn't handle: ${block.type}`);
}
