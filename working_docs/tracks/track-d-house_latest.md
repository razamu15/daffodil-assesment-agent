# TRACK D: THE HOUSE (`infra`)

**GOAL:** Deploy the Doc 2 §6 stack as a **skeleton**: hosting, an API Lambda serving `/api/health` and `/api/login`, the table, the uploads bucket, an Agent Lambda stub, the AgentCore memory resource and the outputs. One command brings it up and one tears it down, with nothing hardcoded. No app logic.

**READ** (only these):
- `working_docs/system-design_latest.md` **§1** (how CDK works), §2 (architecture, why two Lambdas), §3 (Login), **§5** (table keys `PK`/`SK`), **§6 all** (constructs, settings, gotchas, IAM), **§7** (runbook), §8, §9, §10
- `working_docs/agent-design_latest.md` §9 (auth option 1, token format)
- `working_docs/build-plan_latest.md` §2 (`createApp(deps)` → Lambda rule), §4 Track D, §5 (I3 replaces your stubs), §8 rows 2, 4, 6, §9 README, **§10 open decisions 5–7**
- `saad_aws_cli_setup.md` (all; esp. steps 5, 7, 8)

**IMPLEMENT** against:
- `packages/domain/src/api/routes.ts`: the paths `/api/health` and `/api/login`. The stub responses must match `HealthResponseSchema` (`{ok: true}`) and `LoginResponseSchema` (`{token, expiresAt}`) in `api/schemas.ts`. Use the token format from Doc 3 §9 and `AUTH_TOKEN_TTL_HOURS` from `constants.ts` (copy the value; infra doesn't depend on domain).
- The table schema from Doc 2 §5: one table per entity, each keyed by the entity's own id, plus the listed GSIs. On-demand billing and `DESTROY`. Pass the table names to the Lambdas as env vars. Gate I2's `DynamoStore` targets these names and GSIs. Doc 2 §11 explains why cross-table transactions are fine.
- **Lambda entry paths:** stub handlers under `infra/`, using node built-ins only. Pass each entry path in as a single construct prop, so that at I3 it becomes a ~10-line wrapper around `createApp` (api) or `runTurn` (agent) by changing one path. The stub login is temporary and gets deleted at I3.
- `infra/lib/helper-assistant-stack.ts` and `infra/lib/constructs/` (`Data`, `Memory`, `Agent`, `Api`, `Web`, `Outputs`), plus the entry point `infra/bin/app.ts` (already exists as a stub).

**OPEN DECISIONS. Resolve or ask; never invent:**
- **#5 Model ID, inference profile and region.** Saad verifies these in the console (setup doc step 7). Read them from CDK context `modelId`. If the value is missing, synth fails with a clear message. Grant `InvokeModel` on the profile **and** the foundation models.
- **#6 AgentCore Memory CDK construct and IAM action names.** Verify them in current AWS docs (`[VERIFY]` in Doc 2 §6). Record what you confirmed in `infra/README.md` so Saad can update Doc 2.
- **#7 Household time zone.** A deploy-time env var `HOUSEHOLD_TIME_ZONE` passed to both Lambdas. Like `APP_PASSWORD`, the deploy fails loudly if it is unset. No default.

**OWN:** `infra/`

**DO NOT TOUCH:** `packages/*` (domain is frozen), `apps/*` (only *read* `apps/web/dist` for `BucketDeployment`), `fixtures/`, root config (`package.json`, `package-lock.json`, etc.), and the `*_latest.md` docs. **No new npm dependencies without asking.** `aws-cdk-lib`, `aws-cdk` and `esbuild` are installed. Put the `deploy` and `destroy` scripts in `infra/package.json`; `deploy` must build `apps/web` first. Saad adds the root `deploy` and `destroy` aliases at merge.

**USE FAKES FOR:** nothing. This track runs against real AWS. Offline, `npm test -w infra` asserts on the synthesized template.

**DONE WHEN:**
```
npm test -w infra                                    # template assertions: PK/SK, DESTROY + autoDelete, retryAttempts 0,
                                                     #   explicit LogGroups, no account ID/region literals
APP_PASSWORD=test HOUSEHOLD_TIME_ZONE=<IANA zone> npm run deploy -w infra   # from a clean shell
curl -s <AppUrl>/api/health                          # 200 {"ok":true}
curl -s -X POST <AppUrl>/api/login -d '{"password":"test"}'   # 200 token; wrong password → 401
npm run deploy -w infra   (without APP_PASSWORD or HOUSEHOLD_TIME_ZONE)   # fails before touching AWS
npm run destroy -w infra                             # only CDKToolkit left; no buckets or log groups
npm run check
```
Also run `grep -r` for your account ID and region: no hits. Saad's by-eye checks are in build-plan §4 Track D. **Deploy early and redeploy often.**

**OUT OF SCOPE:** real API routes, auth middleware on other routes, the agent loop, `DynamoStore`, `AgentCoreMemory` client code (Tracks A and B, and gates I2 and I3), Cognito and the other auth options, custom domains, CI/CD, alarms beyond Doc 2 §9, and the final README (I4).

**WORKTREE** (Saad runs this; commit Track 0 to `main` first, because HEAD is still `initial commit`):
```
git worktree add ../ws-house   -b track-d-house
cd ../ws-house && npm ci
```
