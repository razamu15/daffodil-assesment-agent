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

**Bootstrap (once per account and region):** `cdk bootstrap` creates a small helper stack (`CDKToolkit`) with the staging bucket and IAM roles that step 3 needs. It's not part of your app, and it's **not** deleted by `cdk destroy`.

**Idempotent:** run `deploy` again and only changes are applied.

---

## 2. Architecture

```
                    ┌──────────────────────────── AWS account (your CDK stack) ────────────────────────────┐
                    │                                                                                       │
 Jordan ─► CloudFront ──► S3 bucket (static React app)                                                      │
 (browser)          │                                                                                       │
                    │  /api/*  ──► HTTP API ──► API Lambda ──► DynamoDB (single table)                     │
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

## 5. Data store: DynamoDB single table

One household means one partition. Everything is a prefix query.

```
PK = HH#<householdId>

SK                                          Item
──────────────────────────────────────────  ────────────────────
HOUSEHOLD                                   Household
HELPER#<helperId>                           Helper
TERM#<helperId>#<effectiveFrom>#<termId>    AgreementTerm
BILL#<periodStart>#<helperId>#<billId>      Bill (lines + approval embedded)
ACTION#<ref zero-padded>                    PendingAction
MSG#<createdAt>#<messageId>                 OutboundMessage
NOTE#<noteId>                               HelperNote
DOC#<docId>                                 SourceDocument
PAY#<paymentId>                             PaymentRecord
SESSION#<sessionId>                         Session (holds activeTurnId lock)
TURN#<turnId>                               Turn trace (sessionId as an attribute; GET /api/turns/:id has only the id)
COUNTER#<name>                              atomic counters (action refs)
```

### Access patterns

| Need | Query |
|---|---|
| All helpers | `begins_with(SK, "HELPER#")` |
| Terms for a helper | `begins_with(SK, "TERM#<helperId>#")` |
| Bills for a month | `begins_with(SK, "BILL#2026-09")` |
| Pending actions | `begins_with(SK, "ACTION#")`, filter on status |
| Turns of a session | `begins_with(SK, "TURN#")`, filter on `sessionId` (small data) |

### Why single table, and what's the catch

- **Why:** one household, small data, trivial queries, and one place for conditional writes.
- **Catch:** less obvious to read. The `Store` interface hides the key scheme (Doc 4 §2), so the rest of the code never sees `SK`.
- **Passed on:** Aurora (VPC, slower deploy, heavier), and one table per entity (more CDK, same result).

### Concurrency tools we use

| Need | DynamoDB feature |
|---|---|
| Version check on confirm | `ConditionExpression: version = :expected` |
| Approved is immutable | `ConditionExpression: #status = :received` on the approve write. No update path for approved items |
| One turn per session | Conditional update of `activeTurnId` |
| Short action refs | Atomic `ADD` on a counter item |

---

## 6. The CDK app

### Layout

```
infra/
  bin/app.ts                  entry: creates the stack with env from CDK_DEFAULT_*
  lib/helper-assistant-stack.ts
  lib/constructs/             small pieces: web hosting, api, agent, data, memory
  cdk.json                    context: modelId, memoryExpiryDays
```

### One stack, grouped into constructs

| Construct | Creates |
|---|---|
| `Data` | DynamoDB table (on-demand, `DESTROY`), uploads bucket (private, `autoDeleteObjects`). The bucket backs the `BlobStore` seam |
| `Memory` | AgentCore Memory resource with strategies. **[VERIFY]** L1 `CfnMemory` name and properties |
| `Agent` | Agent Lambda (esbuild-bundled, 5 min timeout), Bedrock + AgentCore + table permissions, async retries = 0 |
| `Api` | API Lambda, HTTP API route `ANY /api/{proxy+}` |
| `Web` | S3 bucket, CloudFront distribution, `BucketDeployment` of the built React app |
| `Outputs` | `AppUrl`, `Region`, `ModelId`, `MemoryId`, login hint |

### Settings, and nothing hardcoded

| Setting | Where it comes from |
|---|---|
| Account and region | `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` (from the deployer's credentials) |
| Model ID | CDK context `modelId` (`cdk.json` default, overridable with `-c modelId=...`) |
| App password | `APP_PASSWORD` env var at deploy time. **Deploy fails with a clear message if unset** |

### Gotchas to build around

| Gotcha | What to do |
|---|---|
| Lambda bundling wants Docker | Use `NodejsFunction` with `esbuild` as a dev dependency (local bundling, no Docker) |
| CloudFront forwards `Host` to API Gateway and it 403s | Origin request policy `AllViewerExceptHostHeader` |
| CloudFront SPA fallback rewrites API 404s into `index.html` | Use **hash routing** in React (`#/month`) so no fallback is needed |
| Async Lambda invokes retry by default, so a turn could run twice | `retryAttempts: 0` on the Agent Lambda, plus a turn-status guard |
| Lambda log groups are created outside the stack, so teardown leaves them | Declare explicit `LogGroup` resources with `DESTROY` |
| Cross-region inference profile IDs have a region prefix | Parameterize the model ID, and grant `InvokeModel` on the profile **and** the foundation models (`*` region) |
| First failed deploy leaves the stack in `ROLLBACK_COMPLETE` | `npx cdk destroy` (or delete in the console) before retrying |
| UI must be built before synth | Root `deploy` script builds the web app first |

### IAM, least privilege

| Role | Can |
|---|---|
| API Lambda | Read/write the table, put to the uploads bucket, invoke the Agent Lambda |
| Agent Lambda | Read/write the table, read uploads, `bedrock:InvokeModel` (profile + models), AgentCore memory actions **[VERIFY exact action names]** |

---

## 7. Bring-up runbook: exactly what you do

### One-time (per account and region)

| # | Step | Command |
|---|---|---|
| 1 | Finish the CLI setup | See `saad_aws_cli_setup.md` |
| 2 | Install dependencies | `npm ci` |
| 3 | Bootstrap CDK | `npx cdk bootstrap` (uses your active profile and region) |

### Every deploy

| # | Step | Command |
|---|---|---|
| 4 | Pick a password and deploy | `APP_PASSWORD='choose-one' npm run deploy` |
| 5 | Copy `AppUrl` from the Outputs | printed at the end |
| 6 | Open it and log in | Password = the `APP_PASSWORD` you used |
| 7 | Smoke test | `curl <AppUrl>/api/health`, then send a chat message |

`npm run deploy` does: build the React app, then `cdk deploy --require-approval never`.

### Teardown

```
npm run destroy        # cdk destroy --force
```

Removes the stack: tables, buckets (emptied), Lambdas, CloudFront, memory resource, log groups. Leaves only the `CDKToolkit` bootstrap stack. Remove it yourself if you want a fully clean account.

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
| `AccessDeniedException` calling the model | Model not enabled in this region, or IAM missing the inference-profile ARN |
| `ValidationException` about model ID | Wrong profile prefix for this region |
| `Unable to resolve AWS account` | Credentials or profile not set. Run `aws sts get-caller-identity` |
| `This stack uses assets, so the toolkit stack must be deployed` | You skipped `cdk bootstrap` |
| 403 from the API through CloudFront | `Host` header being forwarded (see gotchas) |
| Login works but chat hangs | Agent Lambda error. Check its log group, and the `Turn` item's `error` |
| Memory resource create fails | Region doesn't support AgentCore **[VERIFY]**, or wrong property names |

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
| Store | DynamoDB single table |
| Hosting | CloudFront + S3, `/api/*` proxied |
| Auth | Deploy-time password, API-checked token (Doc 3 §9) |
