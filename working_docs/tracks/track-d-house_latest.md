# TRACK D: THE HOUSE (`infra`)

**GOAL:** Deploy the Doc 2 §6 stack as a **skeleton**: hosting, an API Lambda serving `/api/health` and `/api/login`, the table, the uploads bucket, an Agent Lambda stub, the AgentCore memory resource and the outputs. One command brings it up and one tears it down, with nothing hardcoded. No app logic.

**READ** (only these):
- `working_docs/system-design_latest.md` **§1** (how CDK works), §2 (architecture, why two Lambdas), §3 (Login), **§5** (tables, keys and GSIs), **§6 all** (constructs, settings, gotchas, IAM), **§7** (runbook), §8, §9, §10
- `working_docs/agent-design_latest.md` §9 (auth option 1, token format)
- `working_docs/build-plan_latest.md` §2 (`createApp(deps)` → Lambda rule), §4 Track D, §5 (I3 replaces your stubs), §8 rows 2, 4, 6, §9 README, **§10 open decisions 5–7**
- `saad_aws_cli_setup.md` (all; esp. steps 5, 7, 8)

**IMPLEMENT** against:
- `packages/domain/src/api/routes.ts`: the paths `/api/health` and `/api/login`. The stub responses must match `HealthResponseSchema` (`{ok: true}`) and `LoginResponseSchema` (`{token, expiresAt}`) in `api/schemas.ts`. Use the token format from Doc 3 §9 and `AUTH_TOKEN_TTL_HOURS` from `constants.ts` (copy the value; infra doesn't depend on domain).
- The table schema from Doc 2 §5: one table per entity, each keyed by the entity's own id, plus the listed GSIs. On-demand billing and `DESTROY`. Pass the table names to the Lambdas as env vars. Gate I2's `DynamoStore` targets these names and GSIs. Doc 2 §11 explains why cross-table transactions are fine.
- **Lambda entry paths:** stub handlers under `infra/`, using node built-ins only. Pass each entry path in as a single construct prop, so that at I3 it becomes a ~10-line wrapper around `createApp` (api) or `runTurn` (agent) by changing one path. The stub login is temporary and gets deleted at I3.
- `infra/lib/helper-assistant-stack.ts` and `infra/lib/constructs/` (`Data`, `Memory`, `Agent`, `Api`, `Web`, `Outputs`), plus the entry point `infra/bin/app.ts` (already exists as a stub).

**OPEN DECISIONS. Resolve or ask; never invent:**
**DECIDED (Doc 2 §6, "Settings" and "Cross-chat memory"):**
- **#5 Region and model are pinned.** `infra/lib/deployConfig.ts` holds `us-east-1`, `us.anthropic.claude-sonnet-5-5`, the stack name `HelperAssistant`, the actor ID and both memory namespaces. `bin/app.ts` uses `CDK_DEFAULT_ACCOUNT` for the account and `deployConfig` for the region. Don't use `cdk.json` context. Grant `InvokeModel` on the profile **and** the foundation model in any region.
- **#6 Memory construct is `CfnMemory`** (`aws-cdk-lib/aws-bedrockagentcore`), with semantic and user-preference strategies on the `deployConfig` namespaces. Pass `AGENTCORE_MEMORY_ID`, `AGENTCORE_ACTOR_ID` and `AGENTCORE_HINT_NAMESPACES` (`SEMANTIC=…,PREFERENCE=…`) to the Agent Lambda. **Still open:** the exact AgentCore IAM action names. Verify them and record them in `infra/README.md`.
- **#7 No household time zone.** Don't add a setting. "Today" is the runtime's clock (UTC on Lambda).
- **Bootstrap:** the `deploy` script runs `cdk bootstrap` before `cdk deploy`, every time.
- **Teardown:** the `destroy` script runs `cdk destroy --force`, then `scripts/cleanupLogGroups.ts`, which deletes every log group starting with `/aws/lambda/HelperAssistant-`. The web bucket gets `DESTROY` and `autoDeleteObjects`. `BucketDeployment` gets an explicit `logGroup`. `CDKToolkit` is kept.
- **New dependency (approved):** `@aws-sdk/client-cloudwatch-logs` as an infra devDependency, for the cleanup script. Nothing else.

**OWN:** `infra/`

**DO NOT TOUCH:** `packages/*` (domain is frozen), `apps/*` (only *read* `apps/web/dist` for `BucketDeployment`), `fixtures/`, root config (`package.json`, `package-lock.json`, etc.), and the `*_latest.md` docs. **No new npm dependencies without asking.** `aws-cdk-lib`, `aws-cdk` and `esbuild` are installed. Put the `deploy` and `destroy` scripts in `infra/package.json`; `deploy` must build `apps/web` first. Saad adds the root `deploy` and `destroy` aliases at merge.

**USE FAKES FOR:** nothing. This track runs against real AWS. Offline, `npm test -w infra` asserts on the synthesized template.

**DONE WHEN:**
```
npm test -w infra                                    # template assertions: tables + GSIs, DESTROY + autoDelete on both buckets,
                                                     #   retryAttempts 0, explicit LogGroups, no account ID literal,
                                                     #   memory has both strategies, Agent Lambda env has both namespaces
APP_PASSWORD=test npm run deploy -w infra            # from a clean shell whose default region is NOT us-east-1
npm run deploy -w infra                              # again: bootstrap is a no-op, deploy has no changes
curl -s <AppUrl>/api/health                          # 200 {"ok":true}
curl -s -X POST <AppUrl>/api/login -d '{"password":"test"}'   # 200 token; wrong password → 401
npm run deploy -w infra   (without APP_PASSWORD)    # fails before touching AWS
npm run destroy -w infra                             # only CDKToolkit left; no buckets, memory or HelperAssistant log groups
npm run check
```
Also run `grep -r` for your account ID: no hits. The region and model appear only in `deployConfig.ts`. Saad's by-eye checks are in build-plan §4 Track D. **Deploy early and redeploy often.**

**OUT OF SCOPE:** real API routes, auth middleware on other routes, the agent loop, `DynamoStore`, `AgentCoreMemory` client code (Tracks A and B, and gates I2 and I3), Cognito and the other auth options, custom domains, CI/CD, alarms beyond Doc 2 §9, and the final README (I4).

**WORKTREE** (Saad runs this; commit Track 0 to `main` first, because HEAD is still `initial commit`):
```
git worktree add ../ws-house   -b track-d-house
cd ../ws-house && npm ci
```
