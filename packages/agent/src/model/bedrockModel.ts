/**
 * BedrockModel: the real ModelClient, a thin mapping onto the Bedrock Converse
 * API (Doc 4 §2 seam). The model ID (or inference profile ID) is injected; the
 * region and credentials belong to the BedrockRuntimeClient the caller builds.
 * Nothing is hardcoded here (open decision #5).
 *
 * Anything Converse returns that the domain ModelResponse can't represent (a
 * stop reason or content block it has no name for) throws, instead of being
 * mapped to something that looks plausible.
 *
 * Call sites: the CLI and scenario runner, apps/local-server, the Agent Lambda (I3).
 */
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseCommandInput,
  ConverseCommandOutput,
  ImageFormat,
  Message,
  ToolChoice,
  ToolResultContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { ModelRole, ModelStopReason } from "@helper-assistant/domain";
import type {
  ImageMediaType,
  ModelClient,
  ModelContentBlock,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelRole as ModelRoleT,
  ModelStopReason as ModelStopReasonT,
  ModelToolChoice,
  ModelToolResultContent,
} from "@helper-assistant/domain";

/** The one Converse operation BedrockModel uses. Narrow so tests can fake it without the SDK client. */
export type BedrockConverseApi = { converse(input: ConverseCommandInput): Promise<ConverseCommandOutput> };

export function bedrockConverseApi(client: BedrockRuntimeClient): BedrockConverseApi {
  return { converse: (input) => client.send(new ConverseCommand(input)) };
}

type BedrockJson = NonNullable<ToolResultContentBlock.JsonMember["json"]>;

const IMAGE_FORMAT_BY_MEDIA_TYPE: Record<ImageMediaType, ImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TOOL_CHOICE: { [K in ModelToolChoice["type"]]: (choice: Extract<ModelToolChoice, { type: K }>) => ToolChoice } = {
  auto: () => ({ auto: {} }),
  any: () => ({ any: {} }),
  tool: (choice) => ({ tool: { name: choice.name } }),
};

/** Converse stop reasons the domain names. Others (malformed output, context window exceeded) throw. */
const STOP_REASON_BY_BEDROCK: Record<string, ModelStopReasonT> = Object.fromEntries(
  Object.values(ModelStopReason).map((reason) => [reason, reason]),
);

/** Converse's role strings are the domain's (ModelRole mirrors them). */
const ROLE_BY_BEDROCK: Record<string, ModelRoleT> = { [ModelRole.USER]: ModelRole.USER, [ModelRole.ASSISTANT]: ModelRole.ASSISTANT };

export class BedrockModel implements ModelClient {
  constructor(
    private readonly api: BedrockConverseApi,
    private readonly modelId: string,
  ) {
    if (modelId.trim() === "") throw new Error("BedrockModel needs a model ID (or inference profile ID)");
  }

  async converse(request: ModelRequest): Promise<ModelResponse> {
    const output = await this.api.converse(toConverseInput(this.modelId, request));
    return fromConverseOutput(output);
  }
}

export function toConverseInput(modelId: string, request: ModelRequest): ConverseCommandInput {
  return {
    modelId,
    system: request.system.map((text) => ({ text })),
    messages: request.messages.map(toBedrockMessage),
    inferenceConfig: { maxTokens: request.maxTokens, ...(request.temperature === null ? {} : { temperature: request.temperature }) },
    ...(request.tools.length === 0
      ? {}
      : {
          toolConfig: {
            tools: request.tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema as BedrockJson } } })),
            ...(request.toolChoice === null ? {} : { toolChoice: (TOOL_CHOICE[request.toolChoice.type] as (c: ModelToolChoice) => ToolChoice)(request.toolChoice) }),
          },
        }),
  };
}

function toBedrockMessage(message: ModelMessage): Message {
  return { role: message.role, content: message.content.map(toBedrockBlock) };
}

function toBedrockBlock(block: ModelContentBlock): ContentBlock {
  switch (block.type) {
    case "text":
      return { text: block.text };
    case "image":
      return { image: { format: IMAGE_FORMAT_BY_MEDIA_TYPE[block.mediaType], source: { bytes: block.bytes } } };
    case "toolUse":
      return { toolUse: { toolUseId: block.toolUseId, name: block.name, input: block.input as BedrockJson } };
    case "toolResult":
      return { toolResult: { toolUseId: block.toolUseId, status: block.status, content: block.content.map(toBedrockToolResultContent) } };
  }
}

function toBedrockToolResultContent(content: ModelToolResultContent): ToolResultContentBlock {
  return content.type === "text" ? { text: content.text } : { json: content.json as BedrockJson };
}

export function fromConverseOutput(output: ConverseCommandOutput): ModelResponse {
  const message = output.output?.message;
  if (message === undefined) throw new Error("Bedrock Converse returned no message");
  const stopReason = output.stopReason === undefined ? undefined : STOP_REASON_BY_BEDROCK[output.stopReason];
  if (stopReason === undefined) throw new Error(`Bedrock Converse stop reason "${output.stopReason}" has no domain equivalent`);
  const role = message.role === undefined ? undefined : ROLE_BY_BEDROCK[message.role];
  if (role === undefined) throw new Error(`Bedrock Converse returned an unknown role "${message.role}"`);
  const { inputTokens, outputTokens } = output.usage ?? {};
  if (inputTokens === undefined || outputTokens === undefined) throw new Error("Bedrock Converse returned no token usage");
  return { stopReason, message: { role, content: (message.content ?? []).map(fromBedrockBlock) }, usage: { inputTokens, outputTokens } };
}

function fromBedrockBlock(block: ContentBlock): ModelContentBlock {
  if (block.text !== undefined) return { type: "text", text: block.text };
  if (block.toolUse !== undefined) {
    const { toolUseId, name, input } = block.toolUse;
    if (toolUseId === undefined || name === undefined) throw new Error("Bedrock Converse returned a toolUse block without an id or name");
    return { type: "toolUse", toolUseId, name, input };
  }
  throw new Error(`Bedrock Converse returned a content block the agent doesn't handle: ${Object.keys(block).join(", ")}`);
}
