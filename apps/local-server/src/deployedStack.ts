/**
 * Finds the deployed stack's data resources for DATA_BACKEND=aws (gate I2): the
 * Agent Lambda's name from the stack outputs, then that Lambda's environment,
 * which CDK filled with the table names, the uploads bucket and the AgentCore
 * Memory settings. Reading them off the deployed function means a local run can
 * only ever point at what the stack really created.
 *
 * Credentials come from the default AWS provider chain (AWS_PROFILE, `aws login`).
 *
 * Call sites: index.ts, scripts/resetAwsData.ts.
 */
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { GetFunctionConfigurationCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { agentCoreMemoryConfigFromEnv } from "@helper-assistant/agent";
import type { AgentCoreMemoryConfig } from "@helper-assistant/agent";
import { awsDataConfigFromEnv } from "@helper-assistant/store";
import type { AwsDataConfig } from "@helper-assistant/store";

/** Copies of STACK_NAME and DEPLOY_REGION in infra/lib/deployConfig.ts (pinned on purpose; app packages don't import infra). */
export const DEPLOYED_STACK_NAME = "HelperAssistant";
export const DEPLOYED_REGION = "us-east-1";

/** The stack output naming the Agent Lambda (infra/lib/helper-assistant-stack.ts). */
const AGENT_FUNCTION_OUTPUT = "AgentFunctionName";

export type DeployedResources = { data: AwsDataConfig; memory: AgentCoreMemoryConfig };

export async function deployedResources(): Promise<DeployedResources> {
  const cloudFormation = new CloudFormationClient({ region: DEPLOYED_REGION });
  const { Stacks } = await cloudFormation.send(new DescribeStacksCommand({ StackName: DEPLOYED_STACK_NAME }));
  const functionName = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === AGENT_FUNCTION_OUTPUT)?.OutputValue;
  if (functionName === undefined) throw new Error(`Stack ${DEPLOYED_STACK_NAME} has no ${AGENT_FUNCTION_OUTPUT} output. Run npm run deploy first.`);

  const lambda = new LambdaClient({ region: DEPLOYED_REGION });
  const { Environment } = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
  const env = Environment?.Variables ?? {};
  const memory = agentCoreMemoryConfigFromEnv(env);
  if (memory === null) throw new Error(`The deployed Agent Lambda ${functionName} has no AgentCore Memory settings.`);
  return { data: awsDataConfigFromEnv(env, DEPLOYED_REGION), memory };
}
