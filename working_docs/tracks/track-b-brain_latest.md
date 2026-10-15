# TRACK B: THE BRAIN (`agent`)

**GOAL:** Build the agent harness: a hand-rolled Converse loop with tool dispatch, quarantined extraction, the system prompt, the memory adapter, `BedrockModel` and its fakes, plus a CLI and a scripted scenario runner. The assistant proposes and never commits.

**READ** (only these):
- `working_docs/product-spec_latest.md` §2 (the line), §4 all (capabilities), §8 (trust features), §9 (out of scope)
- `working_docs/agent-design_latest.md` §1, §2.3–2.4, §3.5 (source precedence), **§4 all** (turn, prompt, tools, extraction, memory, confirmations), §5, §6, §8 (A4: `record_bill` is unconfirmed), **§10** (esp. C4, C5, C11, C14, C15)
- `working_docs/system-design_latest.md` §2 ("Why two Lambdas"), §3 (Chat turn)
- `agents-cheatsheet_latest.md` §5.3–5.4 (AgentCore Memory, "remember this"), §6.1, **§7** (confirmations, conflicts, injection), §9 (tests, tracing)
- `working_docs/build-plan_latest.md` §2 (seams), §3 (Track 0 notes), §4 Track B, §6.1, §6.3–6.5

**IMPLEMENT** against these contract files (read, never edit):
- `packages/domain/src/tools/tools.ts`: `toolInputSchemas`, `TOOL_CATEGORY`, `ToolResult`, `ToolErrorCode`, `ProposeResult` / `ProposeOutcome`. The deliberately absent tools stay absent.
- `packages/domain/src/tools/extraction.ts`: the forced output schemas (missing stays `null`, inferences go into `assumptions`)
- `packages/domain/src/ports/model.ts` (`ModelClient`, `ModelRequest`, `ModelToolChoice`) and `ports/services.ts` (`MemoryClient`, `TurnRunner`, `Clock`, `BlobStore`)
- `packages/domain/src/ports/store.ts`, `entities/records.ts` (Turn, ToolCallTrace, ModelCallTrace, ChatMessage, MemoryHint), `entities/action.ts`, `targetKeys.ts`, `constants.ts` (`SOURCE_PRECEDENCE_RANK`)

What to build in `packages/agent`:
- `runTurn({turnId, sessionId}, deps)`. It loads history, injects hints, runs the model ⇄ tools loop, writes memory, saves the Turn trace and releases the lock (Doc 3 §4.1).
- Tools. Each one validates input with `toolInputSchemas` (its single boundary) and returns the `ToolResult` envelope. Tool descriptions and the system prompt also live here.
- `extract_from_document`: a separate call with no tools, output forced via a schema tool and `toolChoice`.
- `BedrockModel`, `FakeModel`, `InMemoryMemory`, `AgentCoreMemory`, `LocalTurnRunner`.

**DEPENDENCY ON CORE** (Track A builds `packages/core` in parallel, and it is empty today): define an agent-owned port in `packages/agent` naming exactly the core operations your tools call (`checkBill`, `deriveMonthStatus`, propose/withdraw, record bill). Test with a double. Swap in A's real exports at I1. **Never reimplement checker logic in agent.**

**OWN:** `packages/agent/`

**DO NOT TOUCH:** `packages/domain` (frozen; ask Saad if a contract change is needed), `packages/core`, `packages/store`, `packages/api`, `fixtures/`, `apps/*`, `infra/`, root config, and the `*_latest.md` docs. **No new npm dependencies without asking.** `@aws-sdk/client-bedrock-runtime` and `@aws-sdk/client-bedrock-agentcore` are installed. Add scripts only to `packages/agent/package.json`. Saad adds the root aliases `agent:cli` and `agent:scenarios` at merge.

**USE FAKES FOR:** ModelClient → `FakeModel` (scripted) in `npm test`; MemoryClient → `InMemoryMemory`; Store / BlobStore → `InMemoryStore` / `InMemoryBlobStore`; Clock → `FixedClock.onDate(STARTER_PACK_TODAY)`. Use the **real `BedrockModel` early** for prompts and extraction. A fake that's too well-behaved hides problems (build-plan §4).

**FIXTURES:** `@helper-assistant/fixtures` provides docs, helpers, terms and bills. `@helper-assistant/fixtures/node`'s `readStarterPackFile` sends the real screenshots to the model. `expectedBillChecks` and `expectedSeptemberMonthStatus` drive the scenario assertions.

**ALSO (decided after Track 0, see agent-design §10 C3, C5, C17):**
- `save_helper` saves profiles directly (no proposal). Helper `role` is free text.
- Give extraction each helper's existing `serviceKey`s so terms and bill lines reuse them.
- "Talked to Priya, the bill is correct" → `propose_bill_approval` with the flagged items as accepted exceptions and Jordan's reason. Never approve directly.

**DONE WHEN:**
```
npm test -w packages/agent          # loop + tools with FakeModel; no AWS needed; no live calls in npm test
npm run cli -w packages/agent       # terminal chat (AWS creds + model ID from env; fails loudly if unset)
npm run scenarios -w packages/agent # scripted conversations + extraction goldens (live, 3×), prints traces
npm run check
```
Trace assertions must show that no turn reaches a commit. Injection text in a bill is ignored. "Pay Lupe" and "remember this" get honest refusals. Saad's by-eye checks are in build-plan §4 Track B.

**OUT OF SCOPE:** the `/api/*` routes and confirm/approve endpoints (Track A). `LambdaTurnRunner` and the Agent Lambda handler (I3). Verifying `AgentCoreMemory` against a deployed memory resource (I2). UI (C). CDK (D). Hardcoding a model ID or region (open decision #5: read them from env). Payments, sending messages, scheduling.

**WORKTREE** (Saad runs this; commit Track 0 to `main` first, because HEAD is still `initial commit`):
```
git worktree add ../ws-brain   -b track-b-brain
cd ../ws-brain && npm ci
```
