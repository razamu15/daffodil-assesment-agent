# Build Plan: Logistics, Parallelization, Testing

Written for: Saad. Doc 4 of 4. The product, system, and agent parts live in Docs 1 to 3. This doc is only about **how to build it**.

| Doc | What it covers |
|---|---|
| 1. `product-spec_latest.md` | What the product does and doesn't do |
| 2. `system-design_latest.md` | AWS architecture, CDK, bring-up runbook |
| 3. `agent-design_latest.md` | Data model, checker, agent, auth options |
| **4. `build-plan_latest.md`** (this) | Repo, parallel tracks, testing, docs to write |
| Side: `saad_aws_cli_setup.md` | Start-line checklist for your AWS account |

---

## 1. Decisions locked

| Decision | Choice | Doc |
|---|---|---|
| Language | TypeScript everywhere | 2 |
| Frontend | React (Vite), hash routing | 2 |
| Package manager | npm workspaces | 2 |
| Agent loop | Hand-rolled on Bedrock Converse | 3 |
| Long-term memory | On (preference + semantic strategies) | 3 |
| Chats | Multiple, stored | 1 |
| Approve flow | Validate → ask helper if off → approve for payment (no money moves) | 1 |
| Auth | Deploy-time password, stateless signed token checked by the API (option 1) | 3 §9 |
| Scheduling | None. Month status runs on app open | 1 |
| Messages | Drafted and handed off, never sent | 1 |

---

## 2. Repo layout and the five seams

### Layout

```
helper-assistant/                 (a new git repo, the deliverable)
  package.json                    npm workspaces
  packages/
    domain/       types, enums, zod schemas, API contract, constants      ← shared, FROZEN after Track 0
    core/         checker, rule evaluators, verdicts, month status, applyAction, conflicts   (pure)
    store/        Store interface + InMemoryStore (+ DynamoStore later)
    agent/        loop, tools, prompts, extraction, memory adapter, ModelClient (+ Bedrock impl)
    api/          createApp(deps): routes, auth, handlers (Hono)
  apps/
    web/          React app
    local-server/ Node dev server: wires api + agent + fakes or real services
  infra/          CDK app
  fixtures/       starter-pack expected JSON, bills, scenarios, golden outputs
  README.md  DESIGN.md
```

### The seams: five interfaces that make parallel work possible

Each interface has a **fake** (runs anywhere, for tests and local dev) and a **real** (AWS).

| Seam | Fake | Real | Why a seam |
|---|---|---|---|
| `Store` | `InMemoryStore` | `DynamoStore` | Everything runs without AWS |
| `ModelClient` | `FakeModel` (scripted replies) | `BedrockModel` | Loop tests are deterministic and free |
| `MemoryClient` | `InMemoryMemory` | `AgentCoreMemory` | Agent works before the memory resource exists |
| `TurnRunner` | `LocalTurnRunner` (in-process) | `LambdaTurnRunner` (async invoke) | "Move to Lambdas" is a swap, not a rewrite |
| `Clock` | `FixedClock.onDate("2026-10-14")` | `SystemClock()` (runtime zone) | Dates like "the 15th" become testable |
| `BlobStore` | `InMemoryBlobStore` | `S3BlobStore` | Screenshot bytes without S3 (added in Track 0) |

**The rule that makes "move to Lambda" easy:**

```
createApp(deps)  ← all the logic lives here, runtime-agnostic
   │
   ├── apps/local-server:   serve with Node,  deps = fakes + real Bedrock (local creds)
   └── infra Lambda handler: wrap with hono/aws-lambda,  deps = real AWS services
```

Lambda handlers are ~10 lines of glue. All the work happens before AWS.

### Shared contracts (written once, in `packages/domain`)

| Contract | Used by |
|---|---|
| Entity types and enums (Doc 3 §2) | Everyone |
| API request/response zod schemas (Doc 2 §4) | API, UI, mock server |
| Tool input/output schemas | Agent, tests |
| `Store`, `ModelClient`, `MemoryClient`, `TurnRunner`, `Clock` | Core, agent, api |
| Fixtures: expected extractions and checks for the starter pack | All tests, mock UI data |

---

## 3. Parallelization: how to split

You suggested: *"UI + agent locally while I do infra, then combine by moving to Lambdas."* That's the right instinct. I compared three ways to split before refining it.

| Strategy | Split | Pros | Cons |
|---|---|---|---|
| **A. By layer** (your idea) | UI + agent ∥ infra | Infra really is independent | "UI + agent" is a big coupled lump. Merging means rewiring to Lambdas, so surprises land at the end |
| **B. By vertical slice** | Agreements ∥ bill check ∥ messaging, each full-stack | Each slice demos on its own | All slices touch the same domain model, UI shell, and infra, so constant merge conflicts |
| **C. By seam** ✅ | Freeze contracts, then four tracks against fakes | Each track is verified alone. Swapping fakes for real is mechanical | ~2 hours of contract work upfront |

**Recommend C.** It's your idea, with two refinements: (1) split "UI + agent" into two independent tracks, and (2) carve out the rules engine as its own track, because it's pure code and the highest-value part.

### The four tracks

```
Track 0: CONTRACTS (sequential, first)
        │
        ├───────────────┬────────────────┬────────────────┐
        ▼               ▼                ▼                ▼
   Track A         Track B           Track C          Track D
   THE RULES       THE BRAIN         THE FACE         THE HOUSE
   core+store+api  agent harness     React UI         CDK infra
   no AI, no AWS   AI, no infra      no backend       no app logic
        │               │                │                │
        └───────┬───────┴────────────────┘                │
                ▼                                         │
       I1: Run everything LOCALLY ◄───────────────────────┘ (D deploys a skeleton meanwhile)
                ▼
       I2: Swap fakes for AWS services (Dynamo, AgentCore), still run locally
                ▼
       I3: Wrap in Lambdas, deploy
                ▼
       I4: E2E on the deployed stack, then harden and document
```

### What each track owns

| Track | Directories (exclusive) | Depends on | Fakes it uses | Never touches |
|---|---|---|---|---|
| **0 Contracts** | `packages/domain`, `fixtures/`, repo skeleton | Docs 1 to 3 | | |
| **A Rules** | `packages/core`, `packages/store`, `packages/api` | domain | `InMemoryStore`, `Clock` | model, AWS |
| **B Brain** | `packages/agent` | domain, `core` signatures | `FakeModel`, `InMemoryStore`, `InMemoryMemory` | UI, CDK |
| **C Face** | `apps/web` | domain (API contract) | Mock API from fixtures | everything server-side |
| **D House** | `infra/` | table and GSI schema (Doc 2 §5), Lambda entry paths | | app logic |

**One owner per directory.** That's what prevents merge conflicts.

### Track 0: Contracts (do this first, with one agent session, ~2 hours)

You can't parallelize before this exists. Output:

```
[x] npm workspaces, tsconfig, eslint (incl. max-lines 450), vitest set up. `npm run check` runs all three
[x] packages/domain: entities, enums, zod schemas (Doc 3 §2). Changes vs Doc 3 listed in Doc 3 §10
[x] API contract: route list with request/response schemas (Doc 2 §4) → domain/src/api/routes.ts
[x] Interfaces: Store, ModelClient, MemoryClient, TurnRunner, Clock, BlobStore → domain/src/ports/
[x] InMemoryStore + InMemoryBlobStore (packages/store) + FixedClock / SystemClock (domain)
[x] fixtures/: starter-pack documents, expected helpers/terms/bills, answer key → @helper-assistant/fixtures
[x] Empty packages with correct names and exports so imports resolve
[x] All tracks' dependencies installed up front, so tracks don't fight over package-lock.json
```

**Track 0 notes for track agents:** don't add dependencies without asking (the lockfile is shared). `InMemoryMemory` and `FakeModel` are Track B's. The full Store conformance suite is Track A's; Track 0 left only smoke tests.

**After Track 0, `packages/domain` is frozen.** If a track needs a change, it goes through you. Contract drift is the number one way parallel work fails.

### Track briefs: how to hand work to an agent

Give each agent session a one-page brief. Template:

```
TRACK: <name>
GOAL: <one sentence>
READ: <doc sections to read: exact § numbers, not the whole chat>
IMPLEMENT: <interfaces and files>
OWN: <directories you may edit>
DO NOT TOUCH: packages/domain and everything else. Ask if a contract change is needed.
USE FAKES FOR: <seams>
DONE WHEN: <exact commands that must pass>
OUT OF SCOPE: <explicit list>
```

Run each track in its **own git worktree and branch**, so the sessions can't overwrite one another.

```
git worktree add ../ws-rules   -b track-a-rules
git worktree add ../ws-brain   -b track-b-brain
git worktree add ../ws-face    -b track-c-face
git worktree add ../ws-house   -b track-d-house
```

---

## 4. Track details and verification gates

For each: what it builds, how it proves itself, and **what you should look at with your own eyes** (green tests aren't enough).

### Track A: The Rules (`core`, `store`, `api`)

**Builds:**
- `checkBill` and rule evaluators (Doc 3 §3), verdict table, plausibility notes
- `deriveMonthStatus`
- `PendingAction` pipeline: propose, conflicts, confirm, stale, supersede, `applyAction` (Doc 3 §4.6)
- `Store` conformance test suite (runs against any `Store`)
- API routes (Doc 2 §4) with token auth

**Done when:**
```
npm test -w packages/core          # answer key passes (§6)
npm test -w packages/store         # conformance suite on InMemoryStore
npm test -w packages/api           # route tests incl. auth, approve, immutability
```

**You verify by eye:**
- Run the checker on the starter pack and read the output against the answer key.
- Try to edit an approved bill any way you can. Confirm there's no path.

### Track B: The Brain (`agent`)

**Builds:**
- Converse loop with tool dispatch
- Tools (Doc 3 §4.3), with schema validation at the boundary
- Quarantined `extract_from_document`
- System prompt, memory adapter (history rebuild, hints injection)
- `BedrockModel` implementation, plus a CLI runner

**Done when:**
```
npm test -w packages/agent                 # loop + tools with FakeModel
npm run agent:cli                          # chat in the terminal (needs AWS creds + model access)
npm run agent:scenarios                    # scripted conversations, prints traces
```

**You verify by eye:**
- Read a full transcript and tool trace for the starter pack. Does the assistant propose, never commit?
- Try an injection bill. Confirm extraction ignores it.
- Ask "remember this" and "pay Lupe". Confirm honest refusals.

**Special note:** prompt tuning needs the live model and is iterative. Use the real `BedrockModel` early in this track, not only `FakeModel`. A fake that's too well-behaved hides problems.

### Track C: The Face (`web`)

**Builds:** screens from Doc 1 §7, with a **mock API** (MSW or a small stub) serving fixture data for these states:

| Scenario | What it shows |
|---|---|
| `empty` | First-run guidance |
| `month-mixed` | Priya flagged, Lupe flagged, Theo clear, one not received |
| `bill-flagged` | Line-by-line check, source beside extraction |
| `pending-conflict` | Two pending actions on one target |
| `approved` | Locked bill, no edit controls |
| `helper-ended` | Settlement flow, key reminder |

**Done when:**
```
npm run dev -w apps/web          # scenario switcher in the corner
npm run build -w apps/web        # production build passes
```

**You verify by eye:** click through every scenario. Is it obvious what needs your decision? Can you tell why a bill was flagged within 5 seconds?

### Track D: The House (`infra`)

**Builds:** Doc 2 §6 constructs, deployed as a **skeleton**: hosting, API Lambda returning `/api/health`, login, tables, uploads bucket, Agent Lambda stub, memory resource, outputs. No real app logic.

**Done when:**
```
APP_PASSWORD=test npm run deploy      # from a clean shell
curl <AppUrl>/api/health              # 200
login works, wrong password fails
npm run destroy                       # leaves only CDKToolkit
```

**You verify by eye:**
- `grep -r` for your account ID in the repo: nothing. The region and model appear only in `infra/lib/deployConfig.ts` and the README (pinned on purpose, Doc 2 §6).
- Deploy once from a profile whose default region is **not** `us-east-1`. It should still land in `us-east-1`.
- Run `npm run deploy` twice in a row. The second bootstrap is a no-op.
- Look in the console after destroy: no leftover buckets, no log groups containing `HelperAssistant`, no memory resource.

**Do this track first and redeploy often.** Infra surprises are the ones that cost hours.

---

## 5. Integration, in four gates

Don't merge everything at once. Each gate isolates one risk.

| Gate | What changes | Risk it isolates | Done when |
|---|---|---|---|
| **I1. All local** | `local-server` wires `api` + `agent` + `InMemoryStore` + `InMemoryMemory` + real `BedrockModel`. UI points at `localhost` instead of the mock | **Do the pieces fit?** (contracts, UI ↔ API ↔ agent) | Starter pack goes end to end in the browser, locally |
| **I2. Real AWS data** | `DynamoStore` and `AgentCoreMemory` replace the fakes. Still runs on your laptop against the deployed table and memory | **Do AWS services behave as assumed?** (conditional writes, memory events, retrieval lag) | `Store` conformance passes on `DynamoStore`. Chat history and long-term hints work |
| **I3. Lambdas** | Wrap `createApp` and `runTurn` in thin handlers. Swap `LocalTurnRunner` for `LambdaTurnRunner`. Build and deploy | **Does packaging, IAM, timeouts, async behave?** | Deployed app passes the I1 scenario |
| **I4. Hardening** | Adversarial tests, fresh deploy, docs | **Does it work for strangers on the first try?** | Fresh-shell deploy and destroy. README steps followed literally |

**Why I2 before I3:** if something breaks at I3 and you've swapped nothing else, the problem is packaging or IAM. If you did both at once, you'd be guessing.

### Merge order

```
Track 0 → (A, B, C, D in any order, directories are disjoint) → I1 → I2 → I3 → I4
```

---

## 6. Testing

### 6.1 Layers

| Layer | What | How | Track |
|---|---|---|---|
| **Checker** | Answer key (§6.2), edge cases | Unit | A |
| **State machine** | Transitions, stale, supersede, immutability | Unit | A |
| **Store conformance** | Same tests run on `InMemoryStore` and `DynamoStore` | Shared suite | A, I2 |
| **API** | Auth, approve gate, conflict responses | Route tests | A |
| **Tools** | Validation, errors, conflict returns | Unit | B |
| **Loop** | `tool_use` handling, multi-call, errors | `FakeModel` scripted | B |
| **Extraction** | Starter pack → expected fields | Golden, live model, run 3× | B |
| **Behavior** | Agent never reaches commit. Gaps → note or flag | Trace assertions | B |
| **Adversarial** | Injection, odd formats, wrong totals | Hand-built set | B, I4 |
| **UI** | Scenarios render and key flows work | Manual + optional smoke | C |
| **Deploy** | Clean deploy, health, login, destroy | Script | D, I4 |

### 6.2 The answer key

The oracle for the starter pack. If the app disagrees, the app is wrong (or my reading is, so verify me).

**Agreements:**

| Helper | Agreed | Source |
|---|---|---|
| Priya | $22/hr. After 10pm $28/hr. Sundays ×1.5. Date night flat $100 until 11pm, then late rate | Jun 14 thread |
| Lupe | Regular $140 (Jan 14) → **$150 from "the 15th"** (Aug 28). Deep clean $220. Weekly Tuesdays | Jan 14 + Aug 28 threads |
| Theo | **$28** / 30 min, **$38** / hour from September (Aug 27). Weekdays around noon. Notes say $25: stale | Aug 27 text; notes |

**Bill results:**

| Bill | Billed | Expected | Verdict | Findings |
|---|---|---|---|---|
| **Priya** | $626 | $556 (or $596 with fee) | `DISCREPANCIES` | All 5 lines `MATCHES`. $40 fee `NOT_COVERED` (claim: "Sam said it's fine"). **Stated total ≠ sum of lines** ($626 vs $596) |
| **Lupe** | $820 | $800 | `DISCREPANCIES` | Sep 1 and Sep 8: billed $150, expected $140 (`DIFFERS`). Sep 15, 22, 29 match |
| **Theo** | $580 | $580 | `CHECKS_OUT` | 18 × $28 + 2 × $38 correct (lines `MATCHES`). INFO findings: `QUANTITY_UNVERIFIABLE` (count of walks), `OCCURRENCE_COUNT_PLAUSIBILITY` 20 billed vs 22 weekdays (no holiday calendar; Theo's remark explains Labor Day) |

**Line-level assertions (Priya):**

| Date | Time | Billed | Expected | Status |
|---|---|---|---|---|
| Fri 9/4 | 6:00–11:30pm date night | $114 | $100 + 0.5h × $28 = $114 | `MATCHES` (assumes late rate = $28) |
| Wed 9/9 | 3–7pm | $88 | 4 × $22 | `MATCHES` |
| Sat 9/12 | 7pm–12am | $122 | 3 × $22 + 2 × $28 | `MATCHES` |
| Sun 9/20 | 10am–2pm | $132 | 4 × $22 × 1.5 | `MATCHES` |
| Sun 9/20 | last minute fee | $40 | none | `NOT_COVERED` |
| Fri 9/25 | 6–11pm date night | $100 | $100 | `MATCHES` |

### 6.3 The traps in the data

| Trap | What it tests |
|---|---|
| Notes say Theo $25, newer text says $28 | Source precedence, shown to Jordan |
| "starting the 15th" with no month | Date inference flagged as an assumption |
| "Wed, Jan 14" with no year | Year inferred, flagged |
| "my late rate after that" | Ambiguity flagged. Assumed $28 |
| Sunday "time and a half" | Which base? Assumed $22 |
| 7pm–12am | Crosses midnight |
| Total ≠ sum of lines | Independent total check |
| Fee with "Sam said it's fine" | A claim, not an agreement |
| Lupe "has a key" in notes only | `houseKeyAccess` is `HAS_KEY`, others `UNKNOWN` |

### 6.4 Scenario tests for the new product features

| Scenario | Expect |
|---|---|
| October opens with only Priya's bill in | Month status: Lupe and Theo `NOT_RECEIVED`. Draft reminder offered |
| Corrected Lupe bill ($800) arrives | Old bill `SUPERSEDED`, new `RECEIVED`, verdict `CHECKS_OUT` |
| Corrected bill arrives after approval | `PERIOD_ALREADY_APPROVED`, not applied |
| Jordan ends Lupe on Oct 14 | Proposal shown, key reminder, final-period bill expected |
| Approve Theo twice | Second is rejected (conditional write) |
| Two tabs propose different Lupe rates | Second confirm → `STALE` |
| "Pay Lupe now" | Honest refusal. Offers approve and shows how to pay |
| Draft message for Priya's fee | Polite, specific, shows the numbers. `HANDED_OFF` after copy |

### 6.5 Unseen-input drill

The reviewers will try new inputs. Rehearse these:

- A new helper type (a tutor, $60/hr, 1h minimum)
- A rule not in our vocabulary ("$10 extra for the second child")
- A bill in a different layout (table, no dates, a total only)
- A duplicate line
- A future-dated rate change ("goes up in January")
- A bill from a helper with no agreement at all
- Hours that cross midnight on a Sunday

**Expected behavior in every case:** use the rule engine where it fits, say "I can't check this" where it doesn't, and never invent.

---

## 7. Timeline (about 2 days)

You're the review bottleneck. Stagger the gates.

| When | You | Agent sessions running |
|---|---|---|
| **Day 1, hour 0 to 2** | Finish `saad_aws_cli_setup.md`. Run Track 0 | Track 0 (one session) |
| **Day 1, hour 2** | Launch four tracks | A, B, C, D in parallel |
| **Day 1, mid** | Gate D (deploy skeleton), then gate A | A, B, C |
| **Day 1, end** | Review B transcripts, C scenarios | B, C finishing |
| **Day 2, morning** | **I1** (all local), then **I2** (real AWS data) | Fixes from I1 |
| **Day 2, afternoon** | **I3** (Lambdas), then **I4** (hardening, docs, fresh deploy) | |
| **Last hour** | Teardown test, README steps followed literally, DESIGN.md | |

### What NOT to parallelize

| Item | Why |
|---|---|
| Track 0 contracts | Everything depends on it |
| Prompt tuning | Needs live model, iterative, needs your judgment |
| Integration gates | Each one isolates a single risk |
| DESIGN.md | Needs the whole picture |

### Risks of this approach

| Risk | Mitigation |
|---|---|
| Contract drift | Frozen `domain`. Changes go through you |
| Fakes too forgiving | Use the real model early in Track B. Run conformance tests on real stores in I2 |
| Duplicated helpers across tracks | One owner per directory. Shared code only in `domain` |
| You get overwhelmed reviewing | The four gates have a "verify by eye" list. Keep to it |
| Late infra surprises | Track D deploys a skeleton first and redeploys at every gate |

---

## 8. Brief requirements → where they're met

| # | Requirement | Where | Verified by |
|---|---|---|---|
| 1 | AgentCore Memory, within and across conversations | Doc 3 §4.5. `AgentCoreMemory` | I2 test: history rebuild, hint retrieval |
| 2 | Claude on Bedrock. Model ID and region in README | `BedrockModel`. Pinned in `infra/lib/deployConfig.ts` | `agent:cli` and the deployed smoke test |
| 3 | A UI | Track C | Scenarios (§4) |
| 4 | CDK. One command up, one down. Nothing tied to *our* account. Outputs | Doc 2 §6 to 7 (deploy runs bootstrap; region pinned on purpose) | Track D gate, I4 fresh deploy |
| 5 | Confirmations. Approved is immutable | `applyAction`, conditional writes | Track A tests, §6.4 scenarios |
| 6 | Not open to the internet | Doc 3 §9, Doc 2 §8 | API route tests (no token → 401), manual |

---

## 9. Docs to write

### README.md

1. What it is (2 lines)
2. Prerequisites: AWS account, Node 22, credentials, **Claude Sonnet 5.5 (`us.anthropic.claude-sonnet-5-5`) enabled in `us-east-1`**. No manual bootstrap: `deploy` does it
3. Deploy: `APP_PASSWORD='...' npm run deploy`
4. Log in: open `AppUrl`, enter the password
5. Teardown: `npm run destroy`. What it removes, and that `CDKToolkit` is kept (with the one command to delete it)
6. Model ID and region, stated explicitly, and why they're pinned

### DESIGN.md (one page max)

| Section | What to say |
|---|---|
| **Key decisions** | Hand-rolled loop, propose/confirm gate, deterministic checker, DynamoDB one table per entity (cross-table transactions), deploy-time password |
| **Remembers vs records** | AgentCore = soft hints. DynamoDB = truth. Why (Doc 3 §4.5) |
| **When inputs disagree** | Precedence (Doc 3 §3.5), show both, Jordan decides |
| **Failure modes** | Misread screenshot, ambiguous terms (late rate), memory wrong or late (long-term extraction takes about a minute), plausibility is soft, "today" is UTC on Lambda |
| **Left out** | Payments, sending, schedules, visit log, multi-user, Cognito, other regions (pinned to `us-east-1`), household time zone |

### Assumptions log (goes into DESIGN.md)

| # | Assumption | Why |
|---|---|---|
| 1 | "the 15th" in an Aug 28 message means Sep 15 | Next 15th after the message |
| 2 | Screenshot dates are 2026 | Weekdays match 2026 |
| 3 | "late rate" = Priya's $28/hr | The only after-hours rate she gave |
| 4 | Sunday ×1.5 applies to the base $22 | Most natural reading |
| 5 | Newer, direct message beats older typed notes (still confirmed by Jordan) | Source precedence |
| 6 | A claim ("Sam said it's fine") isn't an agreement | Needs Jordan's explicit acceptance |
| 7 | Line items are the source of truth over a stated total | Totals are derived |
| 8 | A corrected bill supersedes an earlier unapproved bill | Natural result of "ask the helper" |
| 9 | One user, one household. Whoever logs in decides | Out of scope per brief |

---

## 10. Open decisions

| # | Decision | My recommendation | Doc |
|---|---|---|---|
| 1 | Keep "Approve anyway with exceptions" (P9 / A1) | **Decided: yes** | 1, 3 |
| 2 | Plausibility notes from schedules (P11 / A2) | **Decided: yes** | 1, 3 |
| 3 | Supersede rule for corrected bills (P10 / A3) | **Decided: yes** | 1, 3 |
| 4 | `record_bill` without confirmation (A4) | **Decided: yes.** It runs the checker on save | 3 |
| 5 | Exact Bedrock model ID, inference profile, region | **Decided:** `us.anthropic.claude-sonnet-5-5` in `us-east-1`, pinned in `deployConfig.ts` and the README | 2 §6 |
| 6 | AgentCore Memory CDK construct and IAM action names | **Confirmed** at Track D: `CfnMemory`; `CreateEvent`, `ListEvents`, `RetrieveMemoryRecords` (`infra/README.md`) | 2 |
| 7 | Household time zone for `SystemClock` (what "today" is) | **Decided: dropped.** `SystemClock` uses the runtime's zone (UTC on Lambda). Known failure mode near month boundaries | 2 §6 |

---

## 11. Keeping these docs alive

Only the `_latest` docs are kept, in `working_docs/`. Update them in place when a decision changes.

| Doc | Update when |
|---|---|
| Product spec | A product decision changes |
| System design | Infra, routes, or table keys change |
| Agent design | The data model, tools, or checker rules change |
| Build plan | Tracks, gates, or testing change |

**The brief for each track points at specific § numbers.** If you renumber sections, update the briefs.
