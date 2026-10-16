# infra

The CDK app (one stack, `HelperAssistant`). Design and reasoning: `working_docs/system-design_latest.md` §6 to §7.

```bash
npm run deploy -w infra    # reads APP_PASSWORD, MODEL_PROVIDER (+ ANTHROPIC_API_KEY) from the shell or repo .env;
                           # builds the UI, cdk bootstrap (no-op if done), cdk deploy
npm run destroy -w infra   # delete the stack via CloudFormation, then leftover CDK helper log groups
npm test -w infra                                   # template assertions, no AWS needed
```

## Pinned settings

All in `lib/deployConfig.ts`: region `us-east-1`, model `us.anthropic.claude-sonnet-4-6` (Bedrock) or `claude-sonnet-4-6` (Claude API), stack name, AgentCore actor and memory namespaces. The account comes from the deployer's credentials. The model API is chosen per deploy with `MODEL_PROVIDER`.

## Verified at Track D

| Item | Result | How |
|---|---|---|
| AgentCore Memory construct | `CfnMemory` in `aws-cdk-lib/aws-bedrockagentcore`. Built-in strategies: `semanticMemoryStrategy`, `userPreferenceMemoryStrategy`, each with `name` and `namespaces` | Installed `aws-cdk-lib` typings and the CloudFormation reference |
| AgentCore IAM actions the agent needs | `bedrock-agentcore:CreateEvent`, `bedrock-agentcore:ListEvents`, `bedrock-agentcore:RetrieveMemoryRecords`, on the memory ARN | IAM Access Analyzer `validate-policy` (accepts these, rejects a made-up action) |
| Model profile routing | `us.anthropic.claude-sonnet-4-6` routes to `us-east-1`, `us-east-2`, `us-west-2`. IAM allows the profile ARN plus `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6` | `aws bedrock get-inference-profile` |

## Choices worth knowing

- **The password is a NoEcho stack parameter** (`AppPassword`), passed by `scripts/deploy.ts` from `APP_PASSWORD`. It never appears in the synthesized template or `cdk.out`, and teardown doesn't need it. It still sits in the API Lambda's env vars (Doc 3 §9 accepts this).
- **Lambda handlers live in `apps/lambdas`** (gate I3): `apiHandler.ts` wraps `createApp` with Hono's Lambda adapter; `agentHandler.ts` runs one `runTurn` per async invoke from `LambdaTurnRunner`. Bundles inline every dependency, AWS SDK clients included, since the runtime's built-in SDK can lag.
- **`MODEL_PROVIDER=anthropic` (Bedrock blocked on the dev account):** the API key is a NoEcho parameter (`AnthropicApiKey`) that becomes a Secrets Manager secret `{"api_key"}` encrypted with its own KMS key (rotation on, 7-day deletion window). Only the Agent Lambda may read it, over HTTPS, through Secrets Manager; it reads it once per cold start. It is never in the template, the Lambda env or `cdk.out`. Not rotated automatically: AWS can't mint Claude API keys. Account-wide CloudTrail is left to the account owner. `MODEL_PROVIDER=bedrock` creates no secret.
- **Teardown deletes through CloudFormation** (`scripts/destroy.ts`), not `cdk destroy`, so it doesn't synthesize the app or need any setting. An anthropic deploy's KMS key is *scheduled* for deletion (7 days, KMS's minimum).
- **Table names are generated** by CloudFormation and passed to both Lambdas as `TABLE_*` env vars (`lib/tableSpecs.ts`). Gate I2's `DynamoStore` reads those.
