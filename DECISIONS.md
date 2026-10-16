# Decisions

The decisions that shaped this project: where there was a real choice, a reasonable alternative was turned down, and reversing it would change how the product behaves or how the system is built. Six are about the product, nine about the technology. After them come the [choices any careful engineer would make](#choices-a-reasonable-engineer-would-make), listed briefly, and the [named future fixes](#named-future-fixes).

Each entry gives the decision, why, what was turned down, the trade-off accepted, and where it lives. Short names for the planning docs: PS product spec, SD system design, AD agent design, BP build plan (all in [`working_docs/`](working_docs/)).

The full raw compilation (about 280 entries, the starter-pack assumptions log and a list of places where sources disagree) is kept in [`DECISIONS_v1.md`](DECISIONS_v1.md).

---

## Product

### 1. The assistant proposes; Jordan confirms. It never pays and never sends.

Every change to terms, every bill approval, every message and every engagement end is a *proposal* that waits for Jordan to press Confirm. "Approve" means "good to pay", not "pay": Jordan pays through Venmo or Zelle outside the app and can then mark the bill paid. Messages are drafted, then copied or opened in Messages and recorded as `HANDED_OFF`, never `SENT`, because the app can't know they were sent. Helper profile details (name, phone, how to pay) are the exception: they save directly.

- **Why:** money decisions and anything outward-facing are Jordan's. Gating every name or phone edit behind a confirm step made the app tiresome without protecting anything that matters.
- **Turned down:** auto-paying clean bills under a cap, and sending messages after a confirm. Both are what a real product might do; both need bank or messaging access the brief rules out.
- **Trade-off:** more clicks for Jordan, and "paid" is Jordan's own statement, never verified.
- **Where:** PS §2, §5 (P1 to P5, P14); [`packages/core/src/actions/`](packages/core/src/actions/); the agent's tool list (decision 8).

### 2. A flagged bill's main path is "ask the helper". "Approve anyway" is a quiet second option.

When a bill doesn't match, the main action drafts a message to the helper. A corrected bill from the helper replaces the old unapproved one, which is kept as `SUPERSEDED`. Jordan can still "Approve anyway...", but every flagged item then needs an accepted exception with a reason. A corrected bill for a period that's already approved is refused, so an approval is never quietly undone.

- **Why:** Jordan can't change what a helper billed, and in real life you ask. But Jordan may know better than the bill ("Sam really did OK the $40 fee"), and the brief says Jordan must be able to approve, so a flagged bill must never be stuck.
- **Turned down:** "approve a corrected amount" (Jordan rewriting the helper's bill), and ask-the-helper as the only path.
- **Trade-off:** if a helper finds a mistake after approval, there's no in-app path yet (future fix F1).
- **Where:** PS §4.5, §5 (P3, P9, P10, S1); AD §8 A1, A3; [`packages/core/src/records/bills.ts`](packages/core/src/records/bills.ts); [`apps/web/src/screens/bill/ApproveDialog.tsx`](apps/web/src/screens/bill/ApproveDialog.tsx).

### 3. A bill is a claim, not a source of truth.

The approved amount is always the sum of the lines, never the total the helper wrote. A wrong total is shown and must be accepted as an exception (Priya: $596 approved, not the $626 she wrote). A bill never defines terms: if it charges $28 and no agreement says $28, the line is flagged, and a document that was recorded as a bill can't be read as an agreement. When sources disagree, a direct dated message from the helper beats a pasted thread, which beats Jordan's typed notes, which beat a bill. The assistant shows both sides and proposes; Jordan decides.

- **Why:** totals are derived numbers, and a bill is what the helper says they're owed. Letting a bill set the rate would make every overcharge check out.
- **Turned down:** trusting the stated total, and learning rates from bills.
- **Trade-off:** a bill that arrives with the helper's rates in the same message can't be priced until those rates are confirmed. It is re-checked automatically once they are.
- **Where:** PS §5 P15; AD §3.5; [`packages/core/src/records/billAmounts.ts`](packages/core/src/records/billAmounts.ts); [`packages/agent/src/tools/documents.ts`](packages/agent/src/tools/documents.ts) (`refuseIfRecordedAsBill`); `SOURCE_PRECEDENCE_RANK` in [`packages/domain/src/constants.ts`](packages/domain/src/constants.ts).

### 4. Mid-month goodbyes are supported: helpers end, they are never deleted.

Jordan says "Lupe's last day is Oct 14". The assistant proposes ending the engagement (reminding Jordan when the helper has a house key), and month status then expects a final bill covering the start of the month to the 14th. Bill periods have a kind (`CALENDAR_MONTH`, `CUSTOM_RANGE`, `FINAL_SETTLEMENT`) so this fits the same model as every other bill.

- **Why:** real households switch helpers. This was added beyond the brief.
- **Turned down:** deleting the helper (loses history), and a month string like `"2026-09"` for bill periods (can't express "Oct 1 to 14").
- **Trade-off:** with no visit log, settlement means "I'll check the final bill when it arrives", not "here's what you owe so far" (future fix F3).
- **Where:** PS §4.7, §5 P6; AD §2.3 Helper and Bill; [`packages/core/src/actions/proposals.ts`](packages/core/src/actions/proposals.ts); [`packages/core/src/monthStatus.ts`](packages/core/src/monthStatus.ts).

### 5. Checks on what was actually done are light hints, never verdicts (option B).

The brief asks "is this what we agreed to?", a question about terms. The data also hints at counts (Theo walks on weekdays; Lupe comes on Tuesdays). The checker adds informational notes from schedules it already knows (Theo: 20 walks billed against 22 weekdays), but they never change the agreed amount and never stop a bill from checking out.

- **Why:** free, because the schedules are extracted anyway, and useful to Jordan without pretending to proof the app doesn't have.
- **Turned down:** (A) terms only, which says nothing about counts; (C) a daily visit log, which is real proof but means daily data entry for Jordan.
- **Trade-off:** no holiday calendar, so a weekday holiday still counts as a scheduled day. The bill's own remark ("no walk on Labor Day") explains it.
- **Where:** PS §5 P11, §6; AD §8 A2; [`packages/core/src/checker/plausibility.ts`](packages/core/src/checker/plausibility.ts).

### 6. Jordan drops in files; the assistant works out what each one is.

Uploaded files are typed only by format (text, image, PDF). Jordan doesn't pick "agreement" or "bill" for each file: the assistant reads the contents and decides. With several files, it reads all of them before proposing anything, because one file often names a rate that another states. Anything it can't read is listed with the reason, never silently dropped.

- **Why:** the contents already say what a file is, so asking Jordan to label each one was a step with nothing behind it.
- **Turned down:** a per-file kind dropdown (the earlier design).
- **Trade-off:** "a bill never defines terms" can no longer rest on what Jordan picked, so it is enforced at the tool boundary instead (decision 3).
- **Where:** git `2704d92`; AD §2.3 SourceDocument; [`apps/web/src/lib/fileIntake.ts`](apps/web/src/lib/fileIntake.ts); [`apps/web/src/screens/chat/Composer.tsx`](apps/web/src/screens/chat/Composer.tsx).

---

## Technology

### 7. The model understands, code decides, the database is the truth.

The model reads messy input and explains results. Pure, deterministic code does the comparing, pricing and enforcing: `checkBill` gives the same check for the same inputs and never calls a model. That includes the "likely cause" story for a line that differs ("$150 is the newer rate, which only starts Sep 15"). Confirm is the commit, and no model runs anywhere on that path. Long-term memory (AgentCore) holds soft facts like nicknames and preferences, and goes into the prompt as "background hints, may be outdated". Money facts always come from tools.

- **Why:** the same bill must always get the same answer, and Jordan must be able to trust every number. The model is good at reading and bad at arithmetic it can't show.
- **Turned down:** letting the model check bills, and using memory as a store for agreements.
- **Trade-off:** every new pricing pattern is code, not a prompt tweak (see decision 9's escape hatch).
- **Where:** AD §1, §3, §4.5; [`packages/core/src/checker/`](packages/core/src/checker/); [`packages/core/src/actions/apply.ts`](packages/core/src/actions/apply.ts); [`packages/agent/src/memory/`](packages/agent/src/memory/).

### 8. The safety line is the tool list and the core gates, not the system prompt.

The agent gets read tools, record tools (save a helper, record a bill) and propose tools. It has no `confirm`, `approve`, `send`, `edit approved bill` or `delete`, and asking for an unknown tool gets an error. Every gated change goes through one `PendingAction` pipeline (`AGREEMENT_CHANGE`, `BILL_APPROVAL`, `HELPER_MESSAGE`, `HELPER_ENGAGEMENT_END`). The UI's Approve button calls the same propose-and-confirm function as the chat. Tests check every turn twice: by its trace, and by state (nothing only a confirm can produce appeared).

- **Why:** a prompt can be talked around; a missing tool can't. One pipeline means confirm logic, the audit trail and conflict handling are written once.
- **Turned down:** a separate draft model per feature (four copies of confirm and conflict logic that would drift).
- **Trade-off:** two writes skip the confirm step on purpose: saving a helper's profile (decision 1) and recording a bill, which is always checked before it's saved, so a bad bill is flagged on arrival anyway.
- **Where:** AD §2.3 PendingAction, §4.2, §4.3; [`packages/agent/src/tools/registry.ts`](packages/agent/src/tools/registry.ts); [`packages/agent/src/audit/noCommitAudit.ts`](packages/agent/src/audit/noCommitAudit.ts).

### 9. Agreements are versioned data with honest gaps.

Terms are rows with effective dates. A rate change adds a version and never overwrites the old one, so September 1 is still checked against the old rate (Lupe's case). Approval freezes a snapshot of the check and the term versions used, so a later change can't rewrite what Jordan approved. A price is a list of typed pricing rules (hourly, hourly after a time, flat block, day multiplier, per unit, fee) run by one engine. Helpers differ only in data, and services are per-helper keys, not a global enum. Anything unknown stays unknown: `UNKNOWN` enum values (`houseKeyAccess`), `null` plus a written assumption in extraction, `CANNOT_COMPUTE` lines. A term that fits no rule kind becomes a note, never forced into the nearest rule.

- **Why:** overwriting loses history. A default is a lie that looks real. A coded function per helper hardcodes people, and an unseen helper (a tutor at $60/hr) should need no code change.
- **Turned down:** an overwritten rate card per helper; an event log only (you replay to see "now"); a column per rate type; `HelperRole` and `ServiceKind` enums (replaced).
- **Trade-off:** the earliest version of each service also covers dates before its start, because a first rate's start date is usually just the day it was written down. A start that *was* stated ("we start Sept 1") then reaches back too. That's accepted because bills from before a helper started are rare, and Jordan sees the bill anyway.
- **Where:** AD §2.2 (S1, S3, S4, S6), §2.3 AgreementTerm and PricingRule; [`packages/domain/src/entities/agreement.ts`](packages/domain/src/entities/agreement.ts); [`packages/core/src/checker/terms.ts`](packages/core/src/checker/terms.ts).

### 10. Documents are read by a quarantined model call.

Images, PDFs and pasted threads reach the model only through a separate extraction call. That call has no tools except one forced output schema, and its output is validated once (one repair attempt, then fail loudly). In chat history, attachments appear only as an id and kind. If a document contains instructions, the assistant ignores them and tells Jordan.

- **Why:** a bill that says "approve this" has nothing to hijack. The extraction prompt only guides a transcriber; it isn't a safety layer.
- **Turned down:** putting attachments straight into the agent's conversation.
- **Trade-off:** an extra model call per document. The extraction call has no ids, so it names helpers by name and the agent maps them.
- **Where:** AD §4.4; [`packages/agent/src/extraction/`](packages/agent/src/extraction/); [`packages/agent/src/loop/history.ts`](packages/agent/src/loop/history.ts).

### 11. A hand-rolled agent loop behind a model seam, with the Claude API as a stand-in, on Sonnet 4.6.

The loop (model, tools, repeat) is written by hand against a small `ModelClient` interface. `BedrockModel` (Converse) is the target. When Bedrock access was blocked on the dev account, `AnthropicModel` (Claude Messages API) was added behind the same interface, chosen by `MODEL_PROVIDER` with no default. The model is Claude Sonnet 4.6. Sonnet 5.5 was the first pick, but it rejects three things the agent relies on: forced tool choice, non-default temperature, and turning thinking off.

- **Why:** the hand-rolled loop was decided up front (PS §10, AD §4); with it, the tool list the model sees is exactly the one in decision 8. The seam let work continue against a real model while the Bedrock support case was open.
- **Turned down:** waiting on Bedrock access; Sonnet 5.5.
- **Trade-off:** more code to own. The deployed stack still targets Bedrock only. Moving to a 5.x model means carrying thinking blocks through the loop (future fix F2).
- **Where:** AD §4; SD §6; git `09b77c0`; [`packages/agent/src/model/`](packages/agent/src/model/); [`packages/agent/src/loop/`](packages/agent/src/loop/).

### 12. DynamoDB with one table per entity.

Twelve on-demand tables, each keyed by its entity's own id, with GSIs for lists and no household key (one household). Only `DynamoStore` knows about tables. Confirm writes across tables in one `TransactWriteItems`, guarded by version checks, and an approved bill is refused by a condition on every write.

- **Why:** each table holds one kind of thing and reads like any other database. On-demand billing makes extra tables free.
- **Turned down:** a single table with prefixed sort keys (the earlier design: fewer resources, harder to read); Aurora (needs a VPC, slower to deploy).
- **Trade-off:** about twelve table resources in CDK, and a 100-item transaction limit (fine for one household; future fix F4).
- **Where:** git `0095895`; SD §5, §11; [`infra/lib/tableSpecs.ts`](infra/lib/tableSpecs.ts); [`packages/store/src/dynamoStore.ts`](packages/store/src/dynamoStore.ts).

### 13. Auth: one password set at deploy time, checked by the API.

`APP_PASSWORD` is passed as a NoEcho stack parameter. The API returns an HMAC-signed token that expires after 12 hours and checks it on every route except login and health. Deploy fails before touching AWS if the password is missing.

- **Why:** the fewest moving parts, so the best odds of deploying first time. It protects the data even when someone finds the API URL directly, and there's no insecure default.
- **Turned down:** a generated password in Secrets Manager (one more step for the reviewer); Basic Auth in a CloudFront Function (the API stays open); Cognito (largest, most to break on first deploy); a WAF IP allow-list (blocks reviewers); an API key in the bundle (not real auth).
- **Trade-off:** one shared password, no login rate limiting, and the password sits in the API Lambda's environment. Cognito is the upgrade path (F5).
- **Where:** AD §9; SD §8; [`packages/api/src/auth.ts`](packages/api/src/auth.ts); [`infra/scripts/deploy.ts`](infra/scripts/deploy.ts).

### 14. Pin the region and the model; drop the household time zone.

`us-east-1` and `us.anthropic.claude-sonnet-4-6` are set in one file, [`infra/lib/deployConfig.ts`](infra/lib/deployConfig.ts). The account is never hardcoded. "Today" is the runtime's clock: the laptop's zone locally, UTC on Lambda. Bill and agreement dates are household-local strings and never shift.

- **Why:** AgentCore Memory and the Claude inference profile both have to exist in the deploy region. Pinning a tested region removes a whole class of first-deploy failures. Lambda reserves `TZ`, so the deployed clock can't be moved to the household's zone.
- **Turned down:** reading region and model from the deployer's environment; a `HOUSEHOLD_TIME_ZONE` setting.
- **Trade-off:** the brief says "nothing hardcoded to your account or region", which is read here as "deploys into any account without edits". Another region is a one-line change. Deployed, "today" flips at midnight UTC (5 to 8 pm in the US), which matters only near month boundaries.
- **Where:** git `7697498`; SD §6 Settings and Time; [`packages/domain/src/clock.ts`](packages/domain/src/clock.ts).

### 15. Build by seam: freeze the contracts, build four tracks against fakes, then integrate one risk at a time.

Track 0 froze `packages/domain` (types, enums, zod schemas, the API contract, the ports and their in-memory fakes, fixtures with an answer key). Four tracks were then built in parallel, each owning its own directories: rules, agent, UI, infra. Integration went through four gates, each swapping one thing: all local, then real AWS data, then Lambdas, then hardening. The starter-pack answer key is the oracle: if code disagrees, stop and report, never edit the key.

- **Why:** each track can be checked on its own, swapping a fake for the real thing is mechanical, and a failure at a gate points at one cause.
- **Turned down:** splitting by layer (UI and agent vs infra: one big coupled lump, surprises at the end); splitting by feature (constant merge conflicts on the shared model, UI shell and infra).
- **Trade-off:** about two hours of contract work before any feature code, and any domain change goes through one owner.
- **Where:** BP §2, §3, §5; [`INTERVIEWER_README.md`](INTERVIEWER_README.md) "How it was built".

---

## Choices a reasonable engineer would make

These follow from the brief or from ordinary good practice. They are listed so nothing looks accidental, not argued.

| Choice | Where |
|---|---|
| TypeScript everywhere in one npm-workspaces monorepo; React with Vite; CDK in TypeScript | PS §10; [`package.json`](package.json) |
| Money is integer cents everywhere, including tool and extraction schemas | [`packages/domain/src/primitives.ts`](packages/domain/src/primitives.ts) |
| The API contract is written once as zod schemas and shared by UI, API and mock. Input is validated once at each boundary (API routes, tool dispatch, extraction output, UI client); everything inside trusts it | [`packages/domain/src/api/routes.ts`](packages/domain/src/api/routes.ts); AD §7 |
| Month status is derived on read, not stored, so it can't drift and needs no scheduler | AD §2.2 S5; [`packages/core/src/monthStatus.ts`](packages/core/src/monthStatus.ts) |
| Optimistic concurrency: confirm sends the version Jordan saw; if the basis moved, the action goes `STALE` (a 200, not an error) | AD §4.6; SD §5 |
| Proposals get short refs (`#7`), because a model copies those more reliably than a UUID | AD §2.3 PendingAction |
| Two Lambdas, with agent turns run async and polled, because a turn takes 10 to 60 s and HTTP API cuts requests at about 30 s. Async retries are off so a turn can't run twice | SD §2; [`infra/lib/constructs/agent.ts`](infra/lib/constructs/agent.ts) |
| One URL: CloudFront serves the UI and proxies `/api/*`, so there's no CORS. Hash routing, so there's no SPA fallback rewriting API 404s | SD §6; [`infra/lib/constructs/web.ts`](infra/lib/constructs/web.ts) |
| One-command deploy (always bootstraps; a no-op when already done) and one-command destroy that removes everything the app created, including leftover log groups, but keeps the shared `CDKToolkit` | SD §7; [`infra/scripts/`](infra/scripts/) |
| Least-privilege IAM per Lambda; private uploads bucket served only through the API | SD §6, §8 |
| Line items embedded in the bill; source documents a separate, immutable entity that terms and bills point at | AD §2.2 S2, §2.3 |
| Assistant replies render a small Markdown subset as React elements, never raw HTML | [`apps/web/src/ui/Markdown.tsx`](apps/web/src/ui/Markdown.tsx) |
| Plain-word labels for every domain code, as tables keyed by the enums, so a new enum member fails typecheck until it has a label | [`apps/web/src/ui/labels.ts`](apps/web/src/ui/labels.ts) |
| Multiple chats are saved and listable: cheap, and an audit trail | PS §5 P7 |
| Fakes fail loudly (the fake model throws when run past its script); one store conformance suite runs against both the in-memory and DynamoDB stores | [`packages/store/test/storeConformance.ts`](packages/store/test/storeConformance.ts) |

---

## Named future fixes

| # | Fix | From |
|---|---|---|
| F1 | An "adjustment bill" for an already-approved period (today handled outside the app) | Decision 2 |
| F2 | Move to a Sonnet 5.x model: drop forced tool choice and temperature, carry thinking blocks through the loop | Decision 11 |
| F3 | A visit log, which would answer "what do I owe so far?" for settlement | Decisions 4, 5 |
| F4 | Multiple households: add a `householdId` key and GSIs instead of scans; handle transactions over 100 items | Decision 12 |
| F5 | Cognito as the auth upgrade, with login rate limiting | Decision 13 |
| F6 | Real message sending, as a new `deliveryMode` (the field already exists) | Decision 1 |
| F7 | A scheduled monthly run (EventBridge Scheduler) | Choices table |
| F8 | New pricing rule kinds when similar notes pile up | Decision 9 |
| F9 | Holiday calendar for plausibility counts; household time zone | Decisions 5, 14 |
| F10 | Move note creation from the agent's escape tools into `core/records`; give starter-pack seeding one shared home | Code |
| F11 | Replace the infra Lambda stubs with the real API and agent handlers (gate I3) | [`infra/lib/paths.ts`](infra/lib/paths.ts) |
