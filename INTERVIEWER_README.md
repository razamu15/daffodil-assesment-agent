# For the interviewer

A short guide to this submission: one special case you should know about before you run it, how the app was built, and where to find things.

The product: a helper assistant for Jordan. It reads agreements and bills (notes, pasted threads, screenshots, PDFs), keeps a confirmed record of what was agreed with each helper, checks every bill against that record line by line, and lets Jordan approve a bill for payment. It never pays and never sends messages. Every change to terms, every approval, every message and every engagement end waits for Jordan's confirmation.

---

## Special case: Bedrock vs Claude API

**What the design targets.** The agent calls Claude on **Amazon Bedrock**, through the Converse API:

| Setting | Value |
|---|---|
| Model (inference profile) | `us.anthropic.claude-sonnet-4-6` |
| Region | `us-east-1` |
| Code | `BedrockModel` in [`packages/agent/src/model/bedrockModel.ts`](packages/agent/src/model/bedrockModel.ts) |
| Pinned for deploy in | [`infra/lib/deployConfig.ts`](infra/lib/deployConfig.ts) |

The agent never talks to a model SDK directly. It talks to a small `ModelClient` interface (the "seam"), so the model provider can be swapped without touching the agent loop, the tools or the checker.

**What happened.** On the author's AWS account, Bedrock model access was blocked at the account level ("Error 002"). A support ticket was opened, but the app could not call Bedrock while it was being built.

**What was done about it.** To keep building and testing against a real model, a second implementation was added behind the same seam: `AnthropicModel` ([`packages/agent/src/model/anthropicModel.ts`](packages/agent/src/model/anthropicModel.ts)), which calls the **Claude API** (Messages API, model `claude-sonnet-4-6`). The same model family, the same request shape, the same tools.

Which one runs is chosen by one setting, `MODEL_PROVIDER`, read by [`packages/agent/src/model/modelProvider.ts`](packages/agent/src/model/modelProvider.ts). There is no default: a missing setting stops the app at startup with a message naming what's missing.

**Everything else is still AWS:** DynamoDB, S3, AgentCore Memory, Lambda, HTTP API and CloudFront. Only the model call has an alternative.

### How to choose

Copy [`.env.example`](.env.example) to `.env` at the repo root and fill in one of these:

| Your situation | Settings |
|---|---|
| **Your account has Bedrock access** to Claude Sonnet 4.6 in `us-east-1` | `MODEL_PROVIDER=bedrock`<br>`BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6`<br>`AWS_REGION=us-east-1`<br>plus AWS credentials from your profile (for example `AWS_PROFILE=...`) |
| **No Bedrock access** | `MODEL_PROVIDER=anthropic`<br>`ANTHROPIC_API_KEY=` your key from console.anthropic.com<br>`ANTHROPIC_MODEL_ID=claude-sonnet-4-6` |

These names are exactly the ones in `.env.example` and `modelProvider.ts`.

**Scope of this switch.** The same `MODEL_PROVIDER` picks the model locally and when deployed. With `anthropic`, the deploy stores `ANTHROPIC_API_KEY` in AWS Secrets Manager; it never appears in the template or the Lambda environment. The deployed region and Bedrock model come from `infra/lib/deployConfig.ts`.

### Running it

```bash
npm ci

# Locally (in-memory data, real model per MODEL_PROVIDER):
npm run dev -w @helper-assistant/local-server   # API on :8787
npm run dev:local -w @helper-assistant/web      # UI on :5173
```

On AWS: see [start up and tear down](#aws-start-up-and-tear-down) below.

`LOCAL_SEED` in `.env` picks what the local server starts with: `empty` (the real flow: drop in the starter pack), `documents`, or `full`.

### AWS: start up and tear down

**Before you start:** Node 22+, `npm ci` run at the repo root, and AWS credentials for the account you want to deploy into. Put `AWS_PROFILE=...` in `.env` or export it in the shell, and make sure that profile is signed in (for example `aws login --profile ...`). The region is pinned to `us-east-1` in [`infra/lib/deployConfig.ts`](infra/lib/deployConfig.ts). The account comes from your credentials.

Both scripts read the repo-root `.env` (variables set in the shell win). Deploy needs `APP_PASSWORD`, `MODEL_PROVIDER` and, with `anthropic`, `ANTHROPIC_API_KEY` (see [How to choose](#how-to-choose)).

**Start up** (one command, from the repo root):

```bash
npm run deploy -w infra
```

This builds the UI, runs `cdk bootstrap` (a no-op if your account is already bootstrapped), then deploys the `HelperAssistant` stack. It stops before touching AWS if a required setting is missing, and names it. When it finishes, the stack outputs print `AppUrl` (open it in a browser and log in with the password you chose), plus `Region`, `ModelId` and `MemoryId`.

**Tear down** (one command, from the repo root):

```bash
npm run destroy -w infra
```

This deletes the stack through CloudFormation (no synth, so it needs no deploy settings, only credentials), then deletes the log groups CDK's helper Lambdas leave behind. Every table, bucket and log group is set to delete with the stack, and buckets are emptied first. The one exception is the KMS key an `anthropic` deploy creates: KMS only allows scheduling it for deletion, with a 7-day minimum wait. The `CDKToolkit` bootstrap stack is kept on purpose, since other CDK apps in the account may share it.

**Check without AWS:** `npm test -w infra` runs template assertions against the synthesized stack. More detail in [`infra/README.md`](infra/README.md).

---

## How it was built

**Docs first.** Four planning docs, each answering one question, written before code and kept in sync with it:

| # | Doc | Question it answers |
|---|---|---|
| 1 | [Product spec](working_docs/product-spec_latest.md) | What does the product do, and what doesn't it? |
| 2 | [System design](working_docs/system-design_latest.md) | What runs where on AWS, and how is it deployed? |
| 3 | [Agent design](working_docs/agent-design_latest.md) | How are the data model, the checker and the agent shaped? |
| 4 | [Build plan](working_docs/build-plan_latest.md) | In what order is it built and tested, and how is the work split? |

**Then stages.** The split is by *seam*: freeze the shared contracts, then build four tracks in parallel against fakes, then swap fakes for real services one risk at a time.

| Stage | What it is | Done when |
|---|---|---|
| **Track 0: Contracts** | Shared types, enums, zod schemas, API contract, interfaces (`Store`, `ModelClient`, `MemoryClient`, `TurnRunner`, `Clock`, `BlobStore`), in-memory fakes, starter-pack fixtures with an answer key. `packages/domain` is frozen after this | Everything else can import and build against it |
| **Track A: Rules** | `core`, `store`, `api`: the deterministic bill checker, month status, the propose/confirm pipeline, a store conformance suite, the HTTP API with token auth. No AI, no AWS | Answer key passes; approve gate and immutability tests pass |
| **Track B: Brain** | `agent`: hand-rolled model/tools loop, tools, quarantined extraction, system prompt, memory adapter, model clients. AI, no infra | Loop and tool tests pass with a scripted fake model; live scenarios show the agent proposes and never commits |
| **Track C: Face** | `apps/web`: the React UI against a mock API built from fixtures. No backend | Every scenario clicks through; production build passes without the mock |
| **Track D: House** | `infra`: the CDK stack as a skeleton (hosting, Lambdas, tables, buckets, memory, outputs). No app logic | One command deploys, one destroys, nothing tied to one account |
| **I1: All local** | Local server wires API + agent + in-memory store and memory + a real model. UI talks to it | Starter pack goes end to end in the browser, locally |
| **I2: Real AWS data** | DynamoDB store and AgentCore Memory replace the fakes, still run from a laptop | Store conformance passes on DynamoDB; chat history and long-term hints work |
| **I3: Lambdas** | Wrap the API and agent in thin Lambda handlers, async turn runner, deploy | The deployed app passes the I1 scenario |
| **I4: Hardening** | Adversarial tests, fresh deploy, docs | Fresh-shell deploy and destroy; README steps followed literally |

Tracks A to D could run in parallel because each owns its own directories. Each gate after that changes one thing, so a failure points at one cause.

---

## Where to find things

| What | Where |
|---|---|
| The assignment | [`candidate-pack/BRIEF.md`](candidate-pack/BRIEF.md) |
| Planning docs | [`working_docs/`](working_docs/) (the four above) and per-track briefs in [`working_docs/tracks/`](working_docs/tracks/) |
| The key product and tech decisions, with reasons and what was turned down | [`DECISIONS.md`](DECISIONS.md) |
| Shared contracts: entities, enums, tables, API routes, tool schemas | [`packages/domain/src/`](packages/domain/src/) |
| The bill checker and confirm pipeline (pure code) | [`packages/core/src/`](packages/core/src/) (`checker/`, `actions/`, `records/`) |
| Store interface and in-memory store | [`packages/store/`](packages/store/) |
| The agent: loop, tools, prompts, extraction, memory, model clients | [`packages/agent/src/`](packages/agent/src/) |
| The HTTP API (Hono) | [`packages/api/src/`](packages/api/src/) |
| The UI (React) | [`apps/web/src/`](apps/web/src/) |
| Local dev server | [`apps/local-server/`](apps/local-server/) |
| Starter pack, expected results, answer key | [`fixtures/`](fixtures/) |
| CDK stack | [`infra/`](infra/) and [`infra/README.md`](infra/README.md) |
| Local settings | [`.env.example`](.env.example) |
