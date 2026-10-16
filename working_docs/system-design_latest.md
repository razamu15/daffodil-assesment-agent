# System Design & Infrastructure

Written for: Saad. Doc 2 of 4. API surface and keys synced with the Track 0 contract. What runs where on AWS, how CDK brings it up, and the exact steps to do it.

Before you start: finish `saad_aws_cli_setup.md`. It gets you to the starting line.

Items marked **[VERIFY]** are things I couldn't confirm from here. Check them against current AWS docs before relying on them.

---

## 1. How CDK deploy works (the mental model)

If you've never used it, think of it like this:

| Regular software | Infrastructure with CDK |
|---|---|
| Source code | Your CDK app (TypeScript) |
| Build | `cdk synth` produces a CloudFormation template |
| Deploy | `cdk deploy` hands the template to AWS, which creates everything |
| DB migration tool | CloudFormation: figures out what to create, update, delete |
| `docker compose down` | `cdk destroy` |

**What happens on `cdk deploy`, in order:**

```
1. Run your TypeScript app           → builds a CloudFormation template
2. Bundle Lambda code (esbuild)      → zip files
3. Upload zips + UI files            → to the bootstrap S3 bucket in your account
4. Send the template to CloudFormation
5. CloudFormation creates resources in dependency order
6. If anything fails → it rolls everything back
7. Print the stack Outputs           → the URL and what you need to log in
```

**Bootstrap (once per account and region):** `cdk bootstrap` creates a small helper stack (`CDKToolkit`) with the staging bucket and IAM roles that step 3 needs. It's not part of your app, and it's **not** deleted by `cdk destroy`. Our `deploy` script runs it every time. If the account is already bootstrapped it does nothing, so the reviewer never has to know about it (§7).

**Idempotent:** run `deploy` again and only changes are applied.

---

## 2. Architecture

```
                    ┌──────────────────────────── AWS account (your CDK stack) ────────────────────────────┐
                    │                                                                                       │
 Jordan ─► CloudFront ──► S3 bucket (static React app)                                                      │
 (browser)          │                                                                                       │
                    │  /api/*  ──► HTTP API ──► API Lambda ──► DynamoDB (one table per entity)             │
                    │                              │   │                                                    │
                    │                              │   └──► S3 (uploaded screenshots, private)             │
                    │                              │                                                        │
                    │                              └─ async invoke ─► Agent Lambda ──► Bedrock (Claude)    │
                    │                                                      │      └──► DynamoDB (tools)    │
                    │                                                      └─────────► AgentCore Memory    │
                    └───────────────────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Job | Why it's separate |
|---|---|---|
| **CloudFront + S3** | Serves the React app, and proxies `/api/*` | One URL, no CORS |
| **HTTP API** | Routes `/api/*` to the API Lambda | Cheap, simple |
| **API Lambda** | Auth, reads, uploads, confirm, approve. **The only thing that commits changes** | Confirmations never touch the model |
| **Agent Lambda** | The agent loop: model, tools, memory | Long-running. Needs its own timeout |
| **DynamoDB** | System of record | Serverless, conditional writes |
| **S3 (uploads)** | Screenshots and pasted files | Keep images out of the DB |
| **AgentCore Memory** | Chat events and long-term records | Required by the brief |
| **Bedrock** | Claude model | Required by the brief |

### Why two Lambdas, not one

An agent turn is several model calls and takes 10 to 60 seconds. HTTP API cuts requests at about 30 seconds. So:

```
POST /api/chat  → API Lambda: take lock, create Turn (QUEUED), async-invoke Agent Lambda → return {turnId}
GET  /api/turns/:id (UI polls every ~1s) → status RUNNING / COMPLETED / FAILED + reply
```

Same code runs locally without Lambda. See Doc 4 §2 (`TurnRunner` seam).

---

## 3. Request flows

### Login
```
UI ─ POST /api/login {password} ─► API Lambda: compare in constant time
                                   ─► {token}  (HMAC-signed, expiring)
UI stores token in memory, sends "Authorization: Bearer ..." on every call
```

### Chat turn
```
UI ─ POST /api/chat ─► API Lambda ─ lock session ─ create Turn ─ async invoke ─► Agent Lambda
UI ─ GET /api/turns/:id (poll)                                                    │ loop: Bedrock ⇄ tools
                                                                                  │ write AgentCore events
                                                                                  ▼ save reply, unlock
```

### Upload
```
UI resizes image (≤ ~1500px) ─ POST /api/documents {kind, base64} ─► API Lambda ─► S3 + SourceDocument
```
Base64 in JSON keeps it to one request. Lambda payload limit is 6 MB, so we keep uploads small. Resizing also helps with model image limits. **[VERIFY]** current Converse image limits.

### Confirm
```
UI ─ POST /api/actions/:ref/confirm ─► API Lambda ─ applyAction() ─► DynamoDB conditional write
                                       (NO model call anywhere on this path)
```

### UI "Approve" button
```
UI ─ POST /api/bills/:id/approve {acceptedExceptions[]} ─► API Lambda
     └─ creates BILL_APPROVAL action + confirms it in one request (same gate as chat)
```

---

## 4. API surface

| Method and path | Purpose | Auth |
|---|---|---|
| `POST /api/login` | Exchange password for token | none |
| `GET /api/health` | Smoke test | none |
| `POST /api/chat` | Start a turn → `{turnId}` | token |
| `GET /api/turns/:id` | Poll a turn | token |
| `GET /api/sessions` | List chats | token |
| `GET /api/sessions/:id/messages` | A chat's history (from AgentCore) | token |
| `POST /api/documents` | Upload a screenshot or paste | token |
| `GET /api/documents/:id` | Source document (+ image bytes) for "source beside extraction" | token |
| `GET /api/helpers` | Helpers and key/payment info | token |
| `POST /api/helpers`, `POST /api/helpers/:id` | Create / edit a helper profile (not gated) | token |
| `GET /api/terms?helperId=` | Agreement terms and history | token |
| `GET /api/bills`, `GET /api/bills/:id` | Bills and checks | token |
| `GET /api/month-status?month=` | Derived status (plain code) | token |
| `GET /api/actions?status=` | Pending decisions | token |
| `POST /api/actions/:ref/confirm` | **The commit** | token |
| `POST /api/actions/:ref/reject` | Reject | token |
| `POST /api/bills/:id/approve` | Approve button | token |
| `POST /api/bills/:id/payment` | Mark an approved bill as paid (records it; moves no money) | token |
| `GET /api/messages?helperId=` | Drafted messages to copy | token |
| `POST /api/messages/:id/handed-off` | "I sent it" | token |

This contract is written once as zod schemas in `packages/domain` (`api/routes.ts`) and used by the UI, API, and mock server (Doc 4 §2). Confirm and reject send the `actionVersion` the user saw; confirm may carry an edited `messageBody`. A STALE outcome is a 200 with `action.status = STALE`, not an error.

---

## 5. Data store: DynamoDB, one table per entity

Each entity gets its own table. Every table's partition key is the entity's own id. List queries use a global secondary index (GSI). There's one household, so no table carries a household key.

| Table | Partition key | GSIs (partition → sort) | Used for |
|---|---|---|---|
| `Households` | `householdId` | none | the one household row |
| `Helpers` | `helperId` | none | list = Scan (a handful of rows) |
| `Terms` | `termId` | `byHelper`: `helperId` → `effectiveFrom` | a helper's terms, in date order |
| `Bills` | `billId` | `byMonth`: `periodMonth` → `periodStart`; `byHelper`: `helperId` → `periodStart` | bills for a month; a helper's bills |
| `Actions` | `ref` (number) | `byStatus`: `status` → `ref`; `byTarget`: `targetKey` → `ref` | pending decisions; conflict lookup |
| `Messages` | `messageId` | `byHelper`: `helperId` → `createdAt` | drafted messages per helper |
| `Notes` | `noteId` | `byHelper`: `helperId` → `createdAt` | a helper's notes |
| `Payments` | `paymentId` | `byHelper`: `helperId` → `paidOn`; `byBill`: `billId` | paid status |
| `Documents` | `docId` | none | source documents (images live in S3) |
| `Sessions` | `sessionId` | none | list = Scan, sorted in code. Holds the `activeTurnId` lock |
| `Turns` | `turnId` | `bySession`: `sessionId` → `createdAt` | a chat's turns |
| `Counters` | `name` | none | the atomic action-ref counter |

`periodMonth` (e.g. `2026-09`) is a stored copy of the first 7 characters of `period.start`, written only so the `byMonth` index has a key. Line items and the approval stay embedded in the bill item.

### Why separate tables

- **Why:** each table holds one kind of thing, so it reads like any other database. Keys are just ids.
- **Cost:** about 12 tables and some GSIs in CDK, against one table before. It's all on-demand billing, so there's no extra charge for having more tables.
- **No code changes:** only the future `DynamoStore` (gate I2) knows about tables and keys. Every other package talks to the `Store` interface.
- **Passed on:** a single table with prefixed sort keys (`HELPER#…`, `TERM#…`). It has fewer resources but is harder to read. Also passed on: Aurora (needs a VPC, slower to deploy).

### Concurrency tools we use

| Need | DynamoDB feature |
|---|---|
| Version check on confirm | `ConditionExpression: version = :expected` |
| Approved is immutable | Every bill write carries `attribute_not_exists(billId) OR #status <> :approved`. No update path for approved items |
| One turn per session | Conditional update of `activeTurnId` |
| Short action refs | Atomic `ADD` on the `Counters` item |
| Confirm = action + change together | `TransactWriteItems` across tables (see §11) |

---

## 6. The CDK app

### Layout

```
infra/
  bin/app.ts                  entry: account from CDK_DEFAULT_ACCOUNT, region from deployConfig
  lib/deployConfig.ts         the pinned region, model ID, stack name and memory settings (one place)
  lib/helper-assistant-stack.ts
  lib/constructs/             small pieces: web hosting, api, agent, data, memory
  scripts/cleanupLogGroups.ts runs after `cdk destroy` (see Teardown in §7)
  cdk.json                    app command only
```

### One stack, grouped into constructs

| Construct | Creates |
|---|---|
| `Data` | DynamoDB tables and GSIs from §5 (on-demand, `DESTROY`), uploads bucket (private, `autoDeleteObjects`). The bucket backs the `BlobStore` seam |
| `Memory` | AgentCore Memory (`CfnMemory` from `aws-cdk-lib/aws-bedrockagentcore`, confirmed present in our installed `aws-cdk-lib`) with two built-in long-term strategies: semantic and user preference. Passes the memory ID, actor ID and both namespaces to the Agent Lambda (see "Cross-chat memory" below) |
| `Agent` | Agent Lambda (esbuild-bundled, 5 min timeout), Bedrock + AgentCore + table permissions, async retries = 0 |
| `Api` | API Lambda, HTTP API route `ANY /api/{proxy+}` |
| `Web` | S3 bucket (private, `DESTROY`, `autoDeleteObjects`), CloudFront distribution, `BucketDeployment` of the built React app |
| Outputs (on the stack itself) | `AppUrl`, `Region`, `ModelId`, `MemoryId`, login hint |

### Settings: region and model are pinned

The region and model are fixed constants in `infra/lib/deployConfig.ts`, and the README repeats them. The account is never hardcoded; it comes from the deployer's credentials.

| Setting | Value | Where it comes from |
|---|---|---|
| Account | the deployer's | `CDK_DEFAULT_ACCOUNT` (from their credentials) |
| Region | `us-east-1` | `deployConfig.ts`. Ignores the deployer's default region, so a profile with no region or a different region still deploys to the right place |
| Model ID | `us.anthropic.claude-sonnet-4-6` (US cross-region inference profile) | `deployConfig.ts`. Passed to the Agent Lambda as an env var |
| Stack name | `HelperAssistant` | `deployConfig.ts`. The log group cleanup uses it as a prefix |
| App password | the deployer's choice | `APP_PASSWORD` env var at deploy time. **Deploy fails with a clear message if unset.** `scripts/deploy.ts` passes it as the NoEcho stack parameter `AppPassword`, so it never lands in the template or `cdk.out`, and `cdk destroy` doesn't need it |

**Why pinned:** AgentCore Memory and this Claude profile both have to exist in the region we deploy to. Pinning one region we've tested removes a whole class of first-deploy failures. It also means we don't need a region-to-prefix lookup.

**Why Sonnet 4.6, not Sonnet 5.5:** Sonnet 5.5 (first pick) rejects three request shapes the agent relies on: forced `tool_choice` (extraction forces its schema tool), non-default `temperature` (we send 0.2 and 0), and thinking turned off (it always returns thinking blocks, which `ModelMessage` has no slot for, and which must be replayed unchanged). Sonnet 4.6 accepts all three. Moving to a 5.x model is a named future fix: drop forced tool choice and temperature, and carry thinking blocks through the loop.

**Trade-off to state in DESIGN.md:** the brief says "nothing hardcoded to your account or region". We read that as "it must deploy into the reviewer's account without edits", and it does: any account, from any default region. If they want another region, it's a one-line change in `deployConfig.ts`, as long as the model profile prefix and AgentCore support match that region.

### Time: "today" is the runtime's clock

There's no household time zone setting. `SystemClock` uses the time zone of the machine it runs on. Locally that's your laptop. On Lambda it's **UTC**: Lambda reserves the `TZ` variable, so we can't change it.

**Consequence:** in the deployed app, "today" flips at midnight UTC. That's 5 to 8pm on the US west and east coasts. On the evening of Sept 30 in the US, the deployed app already thinks it's Oct 1. That affects month status and "the 15th"-style date resolution near month boundaries. Bill and agreement dates are household-local strings with no time zone (`primitives.ts`), so they're never shifted. Only "what is today" is.

### Cross-chat memory: making sure it actually works

Memory has two halves (Doc 3 §4.5). Short-term (chat history) only needs the memory ID and actor ID. Long-term (hints across chats) also needs the strategies to exist and the agent to search the right namespaces. If either side is missing, nothing errors: the agent just never gets hints. So:

| Rule | How |
|---|---|
| One owner for namespace strings | `deployConfig.ts` defines both namespaces, for example `/households/{actorId}/semantic` and `/households/{actorId}/preferences`. The `Memory` construct uses them on the strategies and passes them with `{actorId}` filled in to the Agent Lambda as `AGENTCORE_HINT_NAMESPACES` (`SEMANTIC=…,PREFERENCE=…`, the format `scripts/live/env.ts` already parses) |
| One actor | `AGENTCORE_ACTOR_ID` is a constant in `deployConfig.ts` (one household, so one actor) |
| Fail loudly if unwired | The Lambda wiring (I3) throws on startup if `AGENTCORE_HINT_NAMESPACES` is empty. It never quietly falls back to short-term only |
| Template test | `npm test -w infra` asserts the memory has both strategies and the Agent Lambda env has both namespaces |
| Live check (I2 and I4) | Chat 1: tell it a preference ("call Priya 'P'"). Wait about 2 minutes (extraction runs in the background). Chat 2: confirm the hint shows up in the turn trace |

Extraction lag (about a minute) is a known failure mode. It goes in DESIGN.md.

### Gotchas to build around

| Gotcha | What to do |
|---|---|
| Lambda bundling wants Docker | Use `NodejsFunction` with `esbuild` as a dev dependency (local bundling, no Docker) |
| CloudFront forwards `Host` to API Gateway and it 403s | Origin request policy `AllViewerExceptHostHeader` |
| CloudFront SPA fallback rewrites API 404s into `index.html` | Use **hash routing** in React (`#/month`) so no fallback is needed |
| Async Lambda invokes retry by default, so a turn could run twice | `retryAttempts: 0` on the Agent Lambda, plus a turn-status guard |
| Lambda log groups are created outside the stack, so teardown leaves them | Our own Lambdas: explicit `LogGroup` resources with `DESTROY`. `BucketDeployment`: pass its `logGroup` prop too |
| CDK's internal helper Lambdas (e.g. the `autoDeleteObjects` provider) create log groups we can't declare. And the UI `BucketDeployment` Lambda logs during teardown, after its stack-owned group is gone, so Lambda re-creates it | `scripts/cleanupLogGroups.ts` runs after `cdk destroy` and deletes every log group starting with `/aws/lambda/HelperAssistant-` or `HelperAssistant-` (§7). Seen on the first real teardown |
| A US cross-region inference profile routes calls to several US regions | Grant `InvokeModel` on the profile ARN **and** the foundation model ARN in any region (`arn:aws:bedrock:*::foundation-model/...`) |
| First failed deploy leaves the stack in `ROLLBACK_COMPLETE` | `npm run destroy` before retrying |
| UI must be built before synth | Root `deploy` script builds the web app first |
| Deployer's profile has no region, or a different one | Doesn't matter: the region is pinned in `deployConfig.ts` |

### IAM, least privilege

| Role | Can |
|---|---|
| API Lambda | Read/write the tables, read/write the uploads bucket, invoke the Agent Lambda |
| Agent Lambda | Read/write the tables, read uploads, `bedrock:InvokeModel` (profile + models), `bedrock-agentcore:CreateEvent`, `ListEvents`, `RetrieveMemoryRecords` on the memory ARN (verified, see `infra/README.md`) |

---

## 7. Bring-up runbook: exactly what you do

### One-time

| # | Step | Command |
|---|---|---|
| 1 | Finish the CLI setup | See `saad_aws_cli_setup.md` |
| 2 | Enable the model | Bedrock console in `us-east-1`. Claude Sonnet 4.6 (and the Anthropic use-case form, if the account has never used Claude) |
| 3 | Install dependencies | `npm ci` |

### Every deploy

| # | Step | Command |
|---|---|---|
| 4 | Pick a password and deploy | `APP_PASSWORD='choose-one' npm run deploy` |
| 5 | Copy `AppUrl` from the Outputs | printed at the end |
| 6 | Open it and log in | Password = the `APP_PASSWORD` you used |
| 7 | Smoke test | `curl <AppUrl>/api/health`, then send a chat message |

`npm run deploy` does three things, in order:
1. Build the React app.
2. `cdk bootstrap`. This targets the account from the credentials and the pinned region.
3. `cdk deploy --require-approval never`.

**Is running bootstrap every time safe?** Yes:

| Account state | What `cdk bootstrap` does |
|---|---|
| Never bootstrapped | Creates `CDKToolkit` (~1 to 2 minutes) |
| Already bootstrapped, same or newer version | Nothing ("no changes"), a few seconds |
| Bootstrapped with an older version | Upgrades `CDKToolkit` in place. Other CDK apps in that account keep working |

The one case it doesn't cover is an account bootstrapped with a custom qualifier or a locked-down org template. Those deployers know who they are, and the README says to skip to `npx cdk deploy` with their own setup.

### Teardown

```
npm run destroy        # cdk destroy --force, then scripts/cleanupLogGroups.ts
```

**Removes everything this app created:** tables, both buckets (emptied first), Lambdas, HTTP API, CloudFront, the memory resource and its stored events, our log groups, and the CDK helper log groups (the cleanup script deletes every `/aws/lambda/HelperAssistant-*` and `HelperAssistant-*` group, so only ours).

**Kept on purpose:** the `CDKToolkit` bootstrap stack and its staging bucket. They're shared by every CDK app in that account and region. If the reviewer already had them, deleting them would break their other CDK apps. If they want a fully clean account, the README gives the one manual command to delete `CDKToolkit`.

### How long does it take

| Step | Time (rough) |
|---|---|
| Bootstrap | ~1 to 2 minutes |
| First deploy | ~10 to 15 minutes (CloudFront is slow to create) |
| Later deploys | ~1 to 3 minutes for Lambda-only changes |
| Destroy | ~5 to 15 minutes |

### If something fails

| Symptom | Likely cause |
|---|---|
| `AccessDeniedException` calling the model | Model not enabled in `us-east-1`, or IAM missing the profile or foundation-model ARN |
| `Unable to resolve AWS account` | Credentials or profile not set. Run `aws sts get-caller-identity` |
| `cdk bootstrap` fails | Custom-qualifier or org-managed bootstrap. Bootstrap the way that account requires, then `npx cdk deploy` in `infra/` |
| 403 from the API through CloudFront | `Host` header being forwarded (see gotchas) |
| Login works but chat hangs | Agent Lambda error. Check its log group, and the `Turn` item's `error` |
| Agent Lambda fails on startup with a memory config error | `AGENTCORE_HINT_NAMESPACES` not wired (see "Cross-chat memory" in §6) |
| No hints in a new chat | Normal for about a minute after the first chat (background extraction). Longer means a strategy or namespace mismatch |

---

## 8. Security and cost

### "Not open to the internet" (brief requirement)

| Layer | Protection |
|---|---|
| UI | Static shell only. No data in it |
| API | Every route except `login` and `health` needs a valid token |
| S3 uploads | Private, no public access, served only via the API |
| Lambdas | No public function URLs |
| Secrets | Password from the deploy environment, never committed |

Auth options and the reasoning are in Doc 3 §9.

### Cost

| Item | Note |
|---|---|
| Lambda, DynamoDB, S3, CloudFront | Pennies at this scale. All pay-per-use |
| Bedrock tokens | The main cost. Images cost more tokens |
| AgentCore Memory | Per event and record, small |
| Always-on items | None. No VPC, no NAT, no instances |

**Guardrail:** set an AWS budget alert (see the CLI setup doc). Keep receipts. Tear down when done.

---

## 9. Observability

| What | Where |
|---|---|
| Lambda logs | CloudWatch log groups (declared in CDK, deleted on destroy) |
| Per-turn trace | `Turn` item in DynamoDB: model calls, tool calls with inputs and results, tokens, errors |
| Why a bill was flagged | `latestCheck` stored on the bill. Shown in the UI |

Log one structured line per tool call with `turnId` and `sessionId` so logs and traces join.

---

## 10. Decisions locked in this doc

| Decision | Choice |
|---|---|
| Language | TypeScript everywhere |
| Frontend | React (Vite), hash routing |
| Package manager | npm, workspaces |
| IaC | AWS CDK in TypeScript, one stack |
| Compute | Two Lambdas (API, Agent), async turns with polling |
| Store | DynamoDB, one table per entity, GSIs for lists |
| Hosting | CloudFront + S3, `/api/*` proxied |
| Auth | Deploy-time password, API-checked token (Doc 3 §9) |
| Region and model | Pinned: `us-east-1`, `us.anthropic.claude-sonnet-4-6`, in `deployConfig.ts` and the README |
| Bootstrap | Run by `npm run deploy` every time (no-op when already done) |
| Teardown | Everything the app created, including CDK helper log groups. `CDKToolkit` is kept (shared) |
| "Today" | Runtime clock's time zone. UTC on Lambda. No household time zone setting |
| Long-term memory | Semantic + user preference strategies. Namespaces owned by `deployConfig.ts`. Fails loudly if unwired |

---

## 11. Things to point out in the interview

### Atomic writes across tables

**Question:** with separate tables, can a confirm still write several records together?

**Yes.** DynamoDB's `TransactWriteItems` works across tables in the same account and region. It's all or nothing, and each item can carry its own condition (version check, "not approved"). Confirming a term change writes three tables at once: `Actions` (status → CONFIRMED), `Terms` (close the old row, add the new one), and `Bills` (re-checked open bills).

The limits worth saying out loud:

| Limit | What it means for us |
|---|---|
| 100 items per transaction | `STORE_MAX_OPS_PER_COMMIT = 100`. A term change touching more than ~98 open bills would fail. That can't happen for one household, but it's a named future fix |
| A transaction costs 2× the writes | Irrelevant at this scale |
| One region, one account | We have one stack in one region |
| No reads inside the transaction | Version conditions on each item stand in for that |

### GSI reads are eventually consistent

GSIs update a moment after the base table. In two places that matters:
- **Conflict detection on propose** reads `Actions.byTarget`. Two proposals made within a split second might not see each other. This is safe because the real guard runs at confirm: the version check on what each proposal was based on turns the loser `STALE`.
- **Lists right after a write** (e.g. a bill just recorded) might lag by a moment. The UI polls or reloads, so this only shows up as a tiny delay.

### Scans on small tables

`Helpers` and `Sessions` are listed with a full Scan. With one household that's a few rows. A multi-household version would add a `householdId` key and a GSI.
