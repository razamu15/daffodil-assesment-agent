/**
 * AnthropicModel ⇄ Claude Messages API mapping, against a faked API (no network),
 * and the MODEL_PROVIDER switch. Whether the API accepts these shapes is
 * verified live, not here.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ModelStopReason } from "@helper-assistant/domain";
import type { ModelRequest } from "@helper-assistant/domain";
import { describe, expect, it } from "vitest";
import { AnthropicModel, fromAnthropicMessage, modelFromSettings, toAnthropicParams } from "../src/index";

const request: ModelRequest = {
  system: ["You are helpful.", "Today is 2026-10-14."],
  messages: [
    { role: "user", content: [{ type: "text", text: "read this" }, { type: "image", mediaType: "image/png", bytes: new Uint8Array([1, 2]) }] },
    { role: "assistant", content: [{ type: "toolUse", toolUseId: "t1", name: "list_helpers", input: {} }] },
    { role: "user", content: [{ type: "toolResult", toolUseId: "t1", status: "error", content: [{ type: "json", json: { ok: false } }] }] },
  ],
  tools: [{ name: "list_helpers", description: "List helpers", inputSchema: { type: "object", properties: {} } }],
  toolChoice: { type: "tool", name: "list_helpers" },
  maxTokens: 100,
  temperature: 0,
};

const message = (overrides: Partial<Anthropic.Message>): Anthropic.Message =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 3 },
    ...overrides,
  }) as Anthropic.Message;

describe("AnthropicModel", () => {
  it("maps a request onto Messages", () => {
    expect(toAnthropicParams("claude-sonnet-4-6", request)).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      temperature: 0,
      system: [
        { type: "text", text: "You are helpful." },
        { type: "text", text: "Today is 2026-10-14." },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "read this" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AQI=" } },
          ],
        },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "list_helpers", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: [{ type: "text", text: '{"ok":false}' }] }] },
      ],
      tools: [{ name: "list_helpers", description: "List helpers", input_schema: { type: "object", properties: {} } }],
      tool_choice: { type: "tool", name: "list_helpers" },
    });
  });

  it("omits tools, tool choice and temperature when the request has none", () => {
    const params = toAnthropicParams("m", { ...request, tools: [], toolChoice: null, temperature: null });
    expect(params).not.toHaveProperty("tools");
    expect(params).not.toHaveProperty("tool_choice");
    expect(params).not.toHaveProperty("temperature");
  });

  it("maps a response back, and refuses what the domain can't name", async () => {
    const model = new AnthropicModel(
      { create: async () => message({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "list_helpers", input: { a: 1 } } as Anthropic.ContentBlock] }) },
      "m",
    );
    expect(await model.converse(request)).toEqual({
      stopReason: ModelStopReason.TOOL_USE,
      message: { role: "assistant", content: [{ type: "toolUse", toolUseId: "t2", name: "list_helpers", input: { a: 1 } }] },
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    expect(fromAnthropicMessage(message({ stop_reason: "refusal" })).stopReason).toBe(ModelStopReason.CONTENT_FILTERED);
    expect(() => fromAnthropicMessage(message({ stop_reason: "pause_turn" }))).toThrow(/no domain equivalent/);
    expect(() => fromAnthropicMessage(message({ content: [{ type: "thinking" } as Anthropic.ContentBlock] }))).toThrow(/doesn't handle/);
  });

  it("needs a model ID; there is no default", () => {
    expect(() => new AnthropicModel({ create: async () => message({}) }, " ")).toThrow();
  });
});

describe("modelFromSettings", () => {
  it("requires MODEL_PROVIDER and each provider's own settings", () => {
    expect(() => modelFromSettings({})).toThrow(/MODEL_PROVIDER is not set/);
    expect(() => modelFromSettings({ MODEL_PROVIDER: "openai" })).toThrow(/isn't/);
    expect(() => modelFromSettings({ MODEL_PROVIDER: "anthropic", ANTHROPIC_MODEL_ID: "m" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => modelFromSettings({ MODEL_PROVIDER: "bedrock", BEDROCK_MODEL_ID: "m" })).toThrow(/AWS_REGION/);
  });

  it("builds the chosen provider", () => {
    expect(modelFromSettings({ MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL_ID: "claude-sonnet-4-6" }).description).toBe(
      "Claude API claude-sonnet-4-6",
    );
    expect(modelFromSettings({ MODEL_PROVIDER: "bedrock", BEDROCK_MODEL_ID: "b", AWS_REGION: "us-east-1" }).description).toBe("Bedrock b in us-east-1");
  });
});
