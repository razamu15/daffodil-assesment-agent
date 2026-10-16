/**
 * The Agent Lambda: runs one chat turn per async invoke (Doc 2 §2). Long timeout,
 * and no async retries, so a failed turn never runs twice.
 *
 * The model API is chosen per deploy (deployConfig DeployModelProvider):
 *   bedrock    IAM on the pinned inference profile. No secret.
 *   anthropic  the API key, from a NoEcho stack parameter, goes into a Secrets
 *              Manager secret encrypted with its own rotating KMS key. Only this
 *              Lambda may read it, only over HTTPS, and only through Secrets
 *              Manager. It's never in the Lambda's environment or the template.
 *              Not rotated automatically: AWS can't mint a new Claude API key.
 */
import type { CfnParameter} from "aws-cdk-lib";
import { Duration, RemovalPolicy, SecretValue, Stack } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import type { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { ANTHROPIC_MODEL_ID, DeployModelProvider, MODEL_FOUNDATION_ID, MODEL_INFERENCE_PROFILE_ID } from "../deployConfig";
import type { Data } from "./data";
import type { Memory } from "./memory";
import { nodeFunction } from "./nodeFunction";

/** AgentCore Memory data-plane calls the agent makes (verified with IAM Access Analyzer). */
const AGENTCORE_MEMORY_ACTIONS = ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:ListEvents", "bedrock-agentcore:RetrieveMemoryRecords"];

/** Exported for the infra test that checks TURN_LOCK_EXPIRY_MS outlasts it. */
export const AGENT_TIMEOUT = Duration.minutes(15);

/** The shortest wait KMS allows before a scheduled key deletion. */
const KMS_PENDING_WINDOW = Duration.days(7);

export type AgentModel =
  | { provider: typeof DeployModelProvider.BEDROCK }
  | { provider: typeof DeployModelProvider.ANTHROPIC; apiKey: CfnParameter };

export type AgentProps = { entry: string; data: Data; memory: Memory; model: AgentModel };

export class Agent extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentProps) {
    super(scope, id);
    const { account, region } = Stack.of(this);

    this.fn = nodeFunction(this, "Function", {
      entry: props.entry,
      // The async-invoke maximum: a whole-folder upload extracts every file in one turn.
      // TURN_LOCK_EXPIRY_MS (packages/domain constants) must stay longer.
      timeout: AGENT_TIMEOUT,
      memorySize: 1024,
      environment: {
        MODEL_PROVIDER: props.model.provider,
        UPLOADS_BUCKET: props.data.uploadsBucket.bucketName,
        ...props.data.tableEnvironment(),
        ...props.memory.memoryEnvironment(),
      },
    });
    this.fn.configureAsyncInvoke({ retryAttempts: 0 });

    for (const { table } of props.data.tables) table.grantReadWriteData(this.fn);
    props.data.uploadsBucket.grantRead(this.fn);
    this.fn.addToRolePolicy(new PolicyStatement({ actions: AGENTCORE_MEMORY_ACTIONS, resources: [props.memory.memory.attrMemoryArn] }));

    if (props.model.provider === DeployModelProvider.BEDROCK) {
      this.fn.addEnvironment("BEDROCK_MODEL_ID", MODEL_INFERENCE_PROFILE_ID);
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
    } else {
      const key = new Key(this, "ApiKeyEncryption", {
        description: "Encrypts the helper assistant Claude API key secret",
        enableKeyRotation: true,
        pendingWindow: KMS_PENDING_WINDOW,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const secret = new Secret(this, "AnthropicApiKey", {
        description: "Claude API key for the helper assistant agent",
        encryptionKey: key,
        secretObjectValue: { api_key: SecretValue.cfnParameter(props.model.apiKey) },
        removalPolicy: RemovalPolicy.DESTROY,
      });
      this.fn.addEnvironment("ANTHROPIC_MODEL_ID", ANTHROPIC_MODEL_ID);
      this.fn.addEnvironment("ANTHROPIC_API_KEY_SECRET_ARN", secret.secretArn);
      this.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          resources: [secret.secretArn],
          conditions: { Bool: { "aws:SecureTransport": "true" } },
        }),
      );
      this.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["kms:Decrypt", "kms:DescribeKey"],
          resources: [key.keyArn],
          conditions: { StringEquals: { "kms:ViaService": `secretsmanager.${region}.amazonaws.com` } },
        }),
      );
    }
  }
}
