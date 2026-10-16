/**
 * The Agent Lambda: runs one chat turn per async invoke (Doc 2 §2). Long timeout,
 * and no async retries, so a failed turn never runs twice.
 */
import { Duration, Stack } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { MODEL_FOUNDATION_ID, MODEL_INFERENCE_PROFILE_ID } from "../deployConfig";
import type { Data } from "./data";
import type { Memory } from "./memory";
import { nodeFunction } from "./nodeFunction";

/** AgentCore Memory data-plane calls the agent makes (verified with IAM Access Analyzer). */
const AGENTCORE_MEMORY_ACTIONS = ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:ListEvents", "bedrock-agentcore:RetrieveMemoryRecords"];

export type AgentProps = { entry: string; data: Data; memory: Memory };

export class Agent extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentProps) {
    super(scope, id);
    const { account, region } = Stack.of(this);

    this.fn = nodeFunction(this, "Function", {
      entry: props.entry,
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        MODEL_ID: MODEL_INFERENCE_PROFILE_ID,
        UPLOADS_BUCKET: props.data.uploadsBucket.bucketName,
        ...props.data.tableEnvironment(),
        ...props.memory.agentEnvironment(),
      },
    });
    this.fn.configureAsyncInvoke({ retryAttempts: 0 });

    for (const { table } of props.data.tables) table.grantReadWriteData(this.fn);
    props.data.uploadsBucket.grantRead(this.fn);

    this.fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${region}:${account}:inference-profile/${MODEL_INFERENCE_PROFILE_ID}`,
          // The profile may route to any of its regions.
          `arn:aws:bedrock:*::foundation-model/${MODEL_FOUNDATION_ID}`,
        ],
      }),
    );
    this.fn.addToRolePolicy(new PolicyStatement({ actions: AGENTCORE_MEMORY_ACTIONS, resources: [props.memory.memory.attrMemoryArn] }));
  }
}
