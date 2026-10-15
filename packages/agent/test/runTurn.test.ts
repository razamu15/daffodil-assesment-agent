/**
 * The loop and the turn lifecycle with a scripted FakeModel (build-plan §6.1
 * "Loop"): tool_use handling, multiple calls, errors, history and hints, the
 * lock, and the Turn trace.
 */
import { ChatRole, MemoryStrategy, ModelStopReason, StoredEntity, TurnStatus, WriteConditionKind } from "@helper-assistant/domain";
import { billIds, docIds } from "@helper-assistant/fixtures";
import { startTurn } from "@helper-assistant/core";
import { describe, expect, it } from "vitest";
import { FakeModel, LocalTurnRunner, lastToolResults } from "../src/index";
import { MAX_AGENT_LOOP_MODEL_CALLS } from "../src/settings";
import { chat, starterPackAgent } from "./harness";

describe("runTurn", () => {
  it("answers in text: COMPLETED, lock released, both messages in memory", async () => {
    const deps = await starterPackAgent([FakeModel.text("Hi Jordan!")]);
    const turn = await chat(deps, "hello");
    expect(turn).toMatchObject({ status: TurnStatus.COMPLETED, replyText: "Hi Jordan!", error: null });
    expect(turn.modelCalls).toHaveLength(1);
    expect((await deps.store.getSession(turn.sessionId))?.activeTurnId).toBeNull();
    expect((await deps.store.getTurn(turn.turnId))?.status).toBe(TurnStatus.COMPLETED);
    const history = await deps.memory.listChatMessages(turn.sessionId, { maxMessages: 10 });
    expect(history.map((m) => [m.role, m.text])).toEqual([
      [ChatRole.USER, "hello"],
      [ChatRole.ASSISTANT, "Hi Jordan!"],
    ]);
  });

  it("runs tools in order, returns their envelopes to the model, and traces every call", async () => {
    const deps = await starterPackAgent([
      FakeModel.toolUse({ name: "get_month_status", input: { month: null } }, { name: "check_bill", input: { billId: billIds.theo } }),
      (request) => {
        const results = lastToolResults(request);
        expect(results).toHaveLength(2);
        expect(results.every((r) => (r.result as { ok: boolean }).ok)).toBe(true);
        return FakeModel.text("Theo's bill checks out.");
      },
    ]);
    const turn = await chat(deps, "How are the bills?");
    expect(turn.status).toBe(TurnStatus.COMPLETED);
    expect(turn.toolCalls.map((c) => [c.name, c.isError])).toEqual([
      ["get_month_status", false],
      ["check_bill", false],
    ]);
    expect(turn.modelCalls).toHaveLength(2);
    expect(deps.model.exhausted).toBe(true);
  });

  it("feeds a tool error back so the model can recover", async () => {
    const deps = await starterPackAgent([
      FakeModel.toolUse({ name: "get_bill", input: { billId: "bill-nope" } }),
      (request) => {
        expect(lastToolResults(request)[0]!.result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        return FakeModel.text("I couldn't find that bill.");
      },
    ]);
    const turn = await chat(deps, "show me bill-nope");
    expect(turn.status).toBe(TurnStatus.COMPLETED);
    expect(turn.toolCalls[0]!.isError).toBe(true);
  });

  it("rebuilds history for the next turn in the same session, and injects hints as background", async () => {
    const deps = await starterPackAgent([FakeModel.text("First answer."), FakeModel.text("Second answer.")]);
    deps.memory.addHint({ text: "Jordan likes short summaries.", strategy: MemoryStrategy.PREFERENCE, score: 0.9 });
    const first = await chat(deps, "first question");
    await chat(deps, "second question", { sessionId: first.sessionId });
    const second = deps.model.requests[1]!;
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.system.at(-1)).toMatch(/may be outdated[\s\S]*Jordan likes short summaries/);
  });

  it("names attachments by id and kind, never inlining their content", async () => {
    const deps = await starterPackAgent([FakeModel.text("Got it.")]);
    await chat(deps, "Here's Priya's bill", { attachmentDocIds: [docIds.priyaBill] });
    const [request] = deps.model.requests;
    const userText = request!.messages[0]!.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    expect(userText).toContain(`${docIds.priyaBill} (BILL_TEXT)`);
    expect(userText).not.toContain("Total: $626");
    expect(request!.system.join("\n")).toContain(`${docIds.priyaBill} (BILL_TEXT)`);
  });

  it.each([
    ["max_tokens", FakeModel.stopped(ModelStopReason.MAX_TOKENS, [{ type: "text", text: "Half an ans" }])],
    ["content_filtered", FakeModel.stopped(ModelStopReason.CONTENT_FILTERED)],
    ["an empty answer", FakeModel.stopped(ModelStopReason.END_TURN)],
    ["tool_use with no tool", FakeModel.stopped(ModelStopReason.TOOL_USE, [{ type: "text", text: "Let me check" }])],
  ])("fails the turn loudly on %s, keeps Jordan's message, and releases the lock", async (_case, response) => {
    const deps = await starterPackAgent([response]);
    const turn = await chat(deps, "hello");
    expect(turn.status).toBe(TurnStatus.FAILED);
    expect(turn.error).not.toBeNull();
    expect(turn.replyText).toBeNull();
    expect((await deps.store.getSession(turn.sessionId))?.activeTurnId).toBeNull();
    expect((await deps.memory.listChatMessages(turn.sessionId, { maxMessages: 10 })).map((m) => m.role)).toEqual([ChatRole.USER]);
  });

  it("fails when the model call itself throws", async () => {
    const deps = await starterPackAgent([
      () => {
        throw new Error("ThrottlingException");
      },
    ]);
    const turn = await chat(deps, "hello");
    expect(turn).toMatchObject({ status: TurnStatus.FAILED, error: "ThrottlingException" });
  });

  it("stops after the loop bound instead of running forever", async () => {
    const loop = Array.from({ length: MAX_AGENT_LOOP_MODEL_CALLS }, () => FakeModel.toolUse({ name: "list_helpers", input: {} }));
    const deps = await starterPackAgent(loop);
    const turn = await chat(deps, "loop forever");
    expect(turn.status).toBe(TurnStatus.FAILED);
    expect(turn.toolCalls).toHaveLength(MAX_AGENT_LOOP_MODEL_CALLS);
  });

  it("only runs QUEUED turns", async () => {
    const deps = await starterPackAgent([FakeModel.text("once")]);
    const turn = await chat(deps, "hello");
    const { runTurn } = await import("../src/index");
    await expect(runTurn({ turnId: turn.turnId, sessionId: turn.sessionId }, deps)).rejects.toThrow(/COMPLETED/);
  });

  it("fails a turn whose attachment is missing", async () => {
    const deps = await starterPackAgent([]);
    const { turn } = await startTurn(deps, { sessionId: null, text: "see attached", attachmentDocIds: [docIds.priyaBill] });
    // The document disappears between upload and the run (it can't in practice; this checks the guard).
    await deps.store.commit([
      { record: { entity: StoredEntity.TURN, value: { ...turn, input: { ...turn.input, attachmentDocIds: ["doc-gone"] }, version: 2 } }, condition: { kind: WriteConditionKind.VERSION, expected: 1 } },
    ]);
    const { runTurn } = await import("../src/index");
    const finished = await runTurn({ turnId: turn.turnId, sessionId: turn.sessionId }, deps);
    expect(finished).toMatchObject({ status: TurnStatus.FAILED, error: "Attached document doc-gone not found" });
  });
});

describe("LocalTurnRunner", () => {
  it("dispatches without waiting; the turn finishes in the background", async () => {
    const deps = await starterPackAgent([FakeModel.text("done")]);
    const errors: unknown[] = [];
    const runner = new LocalTurnRunner(deps, (_turn, error) => errors.push(error));
    const { turn } = await startTurn(deps, { sessionId: null, text: "hi", attachmentDocIds: [] });
    await runner.start({ turnId: turn.turnId, sessionId: turn.sessionId });
    await runner.idle();
    expect((await deps.store.getTurn(turn.turnId))?.status).toBe(TurnStatus.COMPLETED);
    expect(errors).toEqual([]);
  });

  it("reports a turn it couldn't even start", async () => {
    const deps = await starterPackAgent([]);
    const errors: unknown[] = [];
    const runner = new LocalTurnRunner(deps, (_turn, error) => errors.push(error));
    await runner.start({ turnId: "turn-missing", sessionId: "session-missing" });
    await runner.idle();
    expect(errors).toHaveLength(1);
  });
});
