/**
 * The real adapters' mappings, against faked AWS APIs (no network): BedrockModel
 * ⇄ Converse, AgentCoreMemory ⇄ AgentCore Memory events and records. Whether the
 * services accept these shapes is verified live, not here.
 */
import type { ConverseCommandInput, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import type { CreateEventInput, Event, ListEventsInput, RetrieveMemoryRecordsInput } from "@aws-sdk/client-bedrock-agentcore";
import { ChatRole, MemoryStrategy, ModelStopReason } from "@helper-assistant/domain";
import type { ModelRequest } from "@helper-assistant/domain";
import { describe, expect, it } from "vitest";
import { AgentCoreMemory, BedrockModel, fromConverseOutput, toConverseInput } from "../src/index";
import type { AgentCoreMemoryApi } from "../src/index";

const request: ModelRequest = {
  system: ["You are helpful.", "Today is 2026-10-14."],
  messages: [
    { role: "user", content: [{ type: "text", text: "read this" }, { type: "image", mediaType: "image/png", bytes: new Uint8Array([1]) }] },
    { role: "assistant", content: [{ type: "toolUse", toolUseId: "t1", name: "list_helpers", input: {} }] },
    { role: "user", content: [{ type: "toolResult", toolUseId: "t1", status: "success", content: [{ type: "json", json: { ok: true, data: [] } }] }] },
  ],
  tools: [{ name: "list_helpers", description: "List helpers", inputSchema: { type: "object", properties: {} } }],
  toolChoice: { type: "tool", name: "list_helpers" },
  maxTokens: 100,
  temperature: 0,
};

const output = (overrides: Partial<ConverseCommandOutput>): ConverseCommandOutput => ({
  output: { message: { role: "assistant", content: [{ text: "Hi" }, { toolUse: { toolUseId: "t2", name: "get_bill", input: { billId: "b" } } }] } },
  stopReason: "tool_use",
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  metrics: { latencyMs: 1 },
  $metadata: {},
  ...overrides,
});

describe("BedrockModel", () => {
  it("maps a request onto Converse", () => {
    const input = toConverseInput("model-under-test", request);
    expect(input.modelId).toBe("model-under-test");
    expect(input.system).toEqual([{ text: "You are helpful." }, { text: "Today is 2026-10-14." }]);
    expect(input.messages![0]!.content![1]).toEqual({ image: { format: "png", source: { bytes: new Uint8Array([1]) } } });
    expect(input.messages![2]!.content![0]).toEqual({ toolResult: { toolUseId: "t1", status: "success", content: [{ json: { ok: true, data: [] } }] } });
    expect(input.toolConfig).toEqual({
      tools: [{ toolSpec: { name: "list_helpers", description: "List helpers", inputSchema: { json: { type: "object", properties: {} } } } }],
      toolChoice: { tool: { name: "list_helpers" } },
    });
    expect(input.inferenceConfig).toEqual({ maxTokens: 100, temperature: 0 });
  });

  it("sends a PDF as a named document block", () => {
    const input = toConverseInput("m", {
      ...request,
      messages: [{ role: "user", content: [{ type: "document", mediaType: "application/pdf", bytes: new Uint8Array([1]), name: "document doc-1" }] }],
    });
    expect(input.messages![0]!.content).toEqual([{ document: { format: "pdf", name: "document doc-1", source: { bytes: new Uint8Array([1]) } } }]);
  });

  it("omits toolConfig when there are no tools", () => {
    expect(toConverseInput("m", { ...request, tools: [], toolChoice: null }).toolConfig).toBeUndefined();
  });

  it("maps a response back, and refuses what the domain can't name", async () => {
    const model = new BedrockModel({ converse: async (_input: ConverseCommandInput) => output({}) }, "model-under-test");
    const response = await model.converse(request);
    expect(response).toEqual({
      stopReason: ModelStopReason.TOOL_USE,
      message: { role: "assistant", content: [{ type: "text", text: "Hi" }, { type: "toolUse", toolUseId: "t2", name: "get_bill", input: { billId: "b" } }] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(() => fromConverseOutput(output({ stopReason: "malformed_tool_use" }))).toThrow(/no domain equivalent/);
    expect(() => fromConverseOutput(output({ output: { message: { role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "x" } } }] } } }))).toThrow(
      /doesn't handle/,
    );
  });

  it("needs a model ID; there is no default", () => {
    expect(() => new BedrockModel({ converse: async () => output({}) }, "")).toThrow(/model ID/);
  });
});

class FakeAgentCore implements AgentCoreMemoryApi {
  readonly events: Event[] = [];
  readonly retrieveCalls: RetrieveMemoryRecordsInput[] = [];

  async createEvent(input: CreateEventInput): Promise<void> {
    this.events.push({ ...input, eventId: `e${this.events.length}` } as Event);
  }

  async listEvents(input: ListEventsInput) {
    const mine = this.events.filter((e) => e.sessionId === input.sessionId && e.actorId === input.actorId);
    // Two pages, newest first, to exercise paging and sorting.
    const start = input.nextToken === undefined ? 0 : Number(input.nextToken);
    const page = [...mine].reverse().slice(start, start + 2);
    return { events: page, nextToken: start + 2 < mine.length ? String(start + 2) : undefined };
  }

  async retrieveMemoryRecords(input: RetrieveMemoryRecordsInput) {
    this.retrieveCalls.push(input);
    const records =
      input.namespace === "prefs"
        ? [{ memoryRecordId: "r1", content: { text: "Likes short answers" }, memoryStrategyId: "s1", namespaces: ["prefs"], createdAt: new Date(), score: 0.4 }]
        : [{ memoryRecordId: "r2", content: { text: "Calls Theo 'the dog guy'" }, memoryStrategyId: "s2", namespaces: ["facts"], createdAt: new Date(), score: 0.8 }];
    return { memoryRecordSummaries: records };
  }
}

describe("AgentCoreMemory", () => {
  const config = {
    memoryId: "memory-under-test",
    actorId: "household-under-test",
    hintNamespaces: [
      { namespace: "prefs", strategy: MemoryStrategy.PREFERENCE },
      { namespace: "facts", strategy: MemoryStrategy.SEMANTIC },
    ],
  };

  it("writes one conversational event per message and reads them back in order", async () => {
    const api = new FakeAgentCore();
    const memory = new AgentCoreMemory(api, config);
    await memory.appendChatMessages("s1", [
      { role: ChatRole.USER, text: "one", at: "2026-10-14T12:00:00.000Z" },
      { role: ChatRole.ASSISTANT, text: "two", at: "2026-10-14T12:00:01.000Z" },
      { role: ChatRole.USER, text: "three", at: "2026-10-14T12:00:02.000Z" },
    ]);
    expect(api.events[0]!.payload).toEqual([{ conversational: { role: "USER", content: { text: "one" } } }]);
    const all = await memory.listChatMessages("s1", { maxMessages: 10 });
    expect(all.map((m) => m.text)).toEqual(["one", "two", "three"]);
    expect((await memory.listChatMessages("s1", { maxMessages: 2 })).map((m) => m.text)).toEqual(["two", "three"]);
    expect(await memory.listChatMessages("other", { maxMessages: 10 })).toEqual([]);
  });

  it("merges hints from every strategy namespace, best score first", async () => {
    const api = new FakeAgentCore();
    const hints = await new AgentCoreMemory(api, config).retrieveHints("Theo", { topK: 5 });
    expect(hints).toEqual([
      { text: "Calls Theo 'the dog guy'", strategy: MemoryStrategy.SEMANTIC, score: 0.8 },
      { text: "Likes short answers", strategy: MemoryStrategy.PREFERENCE, score: 0.4 },
    ]);
    expect(api.retrieveCalls.map((c) => c.searchCriteria?.searchQuery)).toEqual(["Theo", "Theo"]);
  });
});
