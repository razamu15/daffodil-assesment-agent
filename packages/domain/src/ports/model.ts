/**
 * ModelClient: one Converse-style call (Doc 4 §2 seam). Fake: FakeModel (scripted
 * replies). Real: BedrockModel (Bedrock Converse API).
 *
 * These types mirror Converse closely enough that BedrockModel is a thin mapping,
 * but stay SDK-free so core/agent tests never import the AWS SDK.
 *
 * Call sites: the agent loop (with tools) and extract_from_document (no tools,
 * output forced through a single schema tool via toolChoice).
 */
import type { ImageMediaType } from "../enums";

export const ModelRole = { USER: "user", ASSISTANT: "assistant" } as const;
export type ModelRole = (typeof ModelRole)[keyof typeof ModelRole];

export type ModelToolResultContent = { type: "text"; text: string } | { type: "json"; json: unknown };

export type ModelContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageMediaType; bytes: Uint8Array }
  | { type: "toolUse"; toolUseId: string; name: string; input: unknown }
  | {
      type: "toolResult";
      toolUseId: string;
      content: ModelToolResultContent[];
      status: "success" | "error";
    };

export type ModelMessage = { role: ModelRole; content: ModelContentBlock[] };

export type ModelToolSpec = {
  name: string;
  description: string;
  /** JSON Schema for the input (from z.toJSONSchema on the tool's zod schema). */
  inputSchema: Record<string, unknown>;
};

export type ModelToolChoice =
  | { type: "auto" }
  /** Must call some tool. */
  | { type: "any" }
  /** Must call this tool. Used to force extraction output into a schema. */
  | { type: "tool"; name: string };

export type ModelRequest = {
  system: string[];
  messages: ModelMessage[];
  tools: ModelToolSpec[];
  /** null when tools is empty. */
  toolChoice: ModelToolChoice | null;
  maxTokens: number;
  temperature: number | null;
};

export const ModelStopReason = {
  END_TURN: "end_turn",
  TOOL_USE: "tool_use",
  MAX_TOKENS: "max_tokens",
  STOP_SEQUENCE: "stop_sequence",
  GUARDRAIL_INTERVENED: "guardrail_intervened",
  CONTENT_FILTERED: "content_filtered",
} as const;
export type ModelStopReason = (typeof ModelStopReason)[keyof typeof ModelStopReason];

export type ModelResponse = {
  stopReason: ModelStopReason;
  message: ModelMessage;
  usage: { inputTokens: number; outputTokens: number };
};

export interface ModelClient {
  converse(request: ModelRequest): Promise<ModelResponse>;
}
