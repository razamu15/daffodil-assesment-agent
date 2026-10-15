# TRACK A: THE RULES (`core`, `store`, `api`)

**GOAL:** Build the deterministic layer: the bill checker, month status, the PendingAction pipeline with `applyAction`, a Store conformance suite, and the Hono API with token auth. Prove it against the starter-pack answer key, with no model and no AWS.

**READ** (only these):
- `working_docs/product-spec_latest.md` §3 (bill states, Month screen), §4.2–4.7, §5 (product decisions)
- `working_docs/agent-design_latest.md` §2.3–2.4 (entities, enums), **§3 all** (checker, verdicts, precedence), §4.3 (`record_bill` supersede rule), **§4.6** (confirm, conflicts, STALE, one gate), §6, §7, §9 (token details), **§10** (Track 0 changes, esp. C1, C2, C6–C13)
- `working_docs/system-design_latest.md` §3 (Login, Confirm, Approve flows), **§4** (API surface), §5 (concurrency tools)
- `working_docs/build-plan_latest.md` §2 (seams), §3 (Track 0 notes), §4 Track A, **§6.1–6.4**

**IMPLEMENT** against these contract files (read, never edit):
- `packages/domain/src/entities/{agreement,bill,check,action,monthStatus,people,records}.ts`
- `packages/domain/src/constants.ts`: `LINE_STATUS_SEVERITY`, `BILL_FINDING_SEVERITY`, `SEVERITY_RANK`, `VERDICT_BY_WORST_SEVERITY`, `PERIOD_STATE_BY_VERDICT`, `PENDING_ACTION_TRANSITIONS`, `ROLE_SERVICE_KINDS`, `SOURCE_PRECEDENCE_RANK`, `WEEKDAYS`, `AUTH_TOKEN_TTL_HOURS`
- `packages/domain/src/targetKeys.ts` (`termSlot`, `targetKeys`), `errors.ts` (`StoreCommitError`)
- `packages/domain/src/ports/store.ts` (Store, `commit`, version contract), `ports/services.ts` (Clock, BlobStore, MemoryClient, TurnRunner)
- `packages/domain/src/api/routes.ts` (`apiRoutes`) and `api/schemas.ts` (`ApiErrorCodeSchema` and request/response schemas)

What to build:
- `packages/core`: `checkBill(bill, termsInEffect, household)` with a rule-kind → evaluator table; `deriveMonthStatus`; the propose pipeline (targetKey, conflicts, `basedOn`), confirm / reject / withdraw / STALE / supersede, and `applyAction`; recording a bill, including the supersede rule and `PERIOD_ALREADY_APPROVED`. Export everything from `src/index.ts`. Each docstring names its call sites (api handlers, agent tools).
- `packages/store/test/`: the conformance suite as a function that takes a store factory, run here on `InMemoryStore`. Gate I2 reuses it for `DynamoStore`.
- `packages/api`: `createApp(deps)`, runtime-agnostic. It validates every request against `apiRoutes` (the one validation boundary) and uses HMAC tokens per Doc 3 §9 via `node:crypto`. `StoreCommitError` maps to 409. A STALE confirm returns 200 with `action.status = STALE`. `POST /api/chat` only takes the session lock, creates the Turn and calls `TurnRunner.start`.

**ORACLE:** `fixtures/src/starterPack/answerKey.ts`: `expectedBillChecks`, `expectedSeptemberMonthStatus`, `expectedTheoOccurrenceCount`, `STARTER_PACK_TODAY`. Inputs come from `@helper-assistant/fixtures`: `starterPackHousehold`, `starterPackHelpers`, `starterPackTerms`, `starterPackBills`. If your code disagrees with the key, **stop and report**. Do not edit the key to match.

**OWN:** `packages/core/`, `packages/store/`, `packages/api/`

**DO NOT TOUCH:** `packages/domain` (frozen; ask Saad if a contract change is needed), `fixtures/`, `packages/agent`, `apps/*`, `infra/`, root config (`package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`), and the `*_latest.md` docs. **No new npm dependencies without asking.** `hono` and `node:crypto` are already available.

**USE FAKES FOR:** Store → `InMemoryStore`; BlobStore → `InMemoryBlobStore` (both in `packages/store`); Clock → `FixedClock.onDate(STARTER_PACK_TODAY)` (domain); TurnRunner and MemoryClient → small recording test doubles inside api tests (`LocalTurnRunner` and `InMemoryMemory` belong to Track B).

**ALSO (decided after Track 0, see agent-design §10 C3, C5, C16, C17):**
- Helper profile routes `POST /api/helpers` and `POST /api/helpers/:id` save directly (version-checked, not gated).
- `POST /api/bills/:id/payment` writes a `PaymentRecord` (only for an APPROVED bill, one per bill). Month status shows `PAID`.
- `record_bill`'s core function runs `checkBill` before saving. Bill lines match terms by `serviceKey`; a key the helper has no term for is `NOT_COVERED`.

**DONE WHEN:**
```
npm test -w packages/core    # answer key passes; transition table; stale/supersede; §6.4 rows that are pure core
npm test -w packages/store   # conformance suite on InMemoryStore (incl. IMMUTABLE_RECORD, TOO_MANY_OPS, ref counter)
npm test -w packages/api     # no token → 401; bad password; approve gate; approve twice → rejected; edit-approved has no path; STALE as 200
npm run check                # typecheck + lint (max-lines 450) + every workspace's tests
```
Saad's by-eye checks are in build-plan §4 Track A.

**OUT OF SCOPE:** `DynamoStore` and `S3BlobStore` (I2). `LambdaTurnRunner` and the `hono/aws-lambda` handler (I3). Running agent turns, tool implementations and prompts (Track B). UI (C). CDK (D). Holiday calendars. Payments and sending messages. Wiring `apps/local-server` (I1).

**INTERFACE WITH TRACK B:** B's tools will call core. Push the exported core function names and signatures early (an early commit on your branch, with docstrings). Track B codes against its own port and adapts to your exports at I1.

**WORKTREE** (Saad runs this; commit Track 0 to `main` first, because HEAD is still `initial commit` and the branch would start without `packages/`):
```
git worktree add ../ws-rules   -b track-a-rules
cd ../ws-rules && npm ci
```
