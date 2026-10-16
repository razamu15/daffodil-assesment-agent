# infra

The CDK app (one stack, `HelperAssistant`). Design and reasoning: `working_docs/system-design_latest.md` §6 to §7.

```bash
APP_PASSWORD='choose-one' npm run deploy -w infra   # build UI, cdk bootstrap (no-op if done), cdk deploy
npm run destroy -w infra                            # cdk destroy, then delete leftover CDK helper log groups
npm test -w infra                                   # template assertions, no AWS needed
```

## Pinned settings

All in `lib/deployConfig.ts`: region `us-east-1`, model `us.anthropic.claude-sonnet-5-5`, stack name, AgentCore actor and memory namespaces. The account comes from the deployer's credentials.

## Verified at Track D

| Item | Result | How |
|---|---|---|
| AgentCore Memory construct | `CfnMemory` in `aws-cdk-lib/aws-bedrockagentcore`. Built-in strategies: `semanticMemoryStrategy`, `userPreferenceMemoryStrategy`, each with `name` and `namespaces` | Installed `aws-cdk-lib` typings and the CloudFormation reference |
| AgentCore IAM actions the agent needs | `bedrock-agentcore:CreateEvent`, `bedrock-agentcore:ListEvents`, `bedrock-agentcore:RetrieveMemoryRecords`, on the memory ARN | IAM Access Analyzer `validate-policy` (accepts these, rejects a made-up action) |
| Model profile routing | `us.anthropic.claude-sonnet-5-5` routes to `us-east-1`, `us-east-2`, `us-west-2`. IAM allows the profile ARN plus `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-5-5` | `aws bedrock get-inference-profile` |

## Choices worth knowing

- **The password is a NoEcho stack parameter** (`AppPassword`), passed by `scripts/deploy.ts` from `APP_PASSWORD`. It never appears in the synthesized template or `cdk.out`, and `cdk destroy` doesn't need it. It still sits in the API Lambda's env vars (Doc 3 §9 accepts this).
- **Lambda handler entries are props** (`lib/paths.ts`). The `lambda/*Stub.ts` files are temporary. At I3, point the entries at thin wrappers around `createApp` and `runTurn`, then delete the stubs.
- **Table names are generated** by CloudFormation and passed to both Lambdas as `TABLE_*` env vars (`lib/tableSpecs.ts`). Gate I2's `DynamoStore` reads those.
