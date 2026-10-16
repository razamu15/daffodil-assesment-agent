/**
 * The whole app as one stack (Doc 2 §6): data, memory, the two Lambdas, hosting,
 * and the outputs a reviewer needs to open the app.
 */
import { CfnOutput, CfnParameter, Stack } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Agent } from "./constructs/agent";
import { Api } from "./constructs/api";
import { Data } from "./constructs/data";
import { Memory } from "./constructs/memory";
import { Web } from "./constructs/web";
import { ANTHROPIC_MODEL_ID, DeployModelProvider, MODEL_INFERENCE_PROFILE_ID } from "./deployConfig";
import type { AgentModel } from "./constructs/agent";

export type HelperAssistantStackProps = StackProps & {
  apiHandlerEntry: string;
  agentHandlerEntry: string;
  webDist: string;
  /** MODEL_PROVIDER at deploy time (scripts/deploy.ts). */
  modelProvider: DeployModelProvider;
};

export class HelperAssistantStack extends Stack {
  constructor(scope: Construct, id: string, props: HelperAssistantStackProps) {
    super(scope, id, props);

    const appPassword = new CfnParameter(this, "AppPassword", {
      type: "String",
      noEcho: true,
      minLength: 1,
      description: "Login password for the app. Passed by `npm run deploy` from APP_PASSWORD.",
    });

    const model: AgentModel =
      props.modelProvider === DeployModelProvider.BEDROCK
        ? { provider: DeployModelProvider.BEDROCK }
        : {
            provider: DeployModelProvider.ANTHROPIC,
            apiKey: new CfnParameter(this, "AnthropicApiKey", {
              type: "String",
              noEcho: true,
              minLength: 1,
              description: "Claude API key, stored in Secrets Manager. Passed by `npm run deploy` from ANTHROPIC_API_KEY.",
            }),
          };

    const data = new Data(this, "Data");
    const memory = new Memory(this, "Memory");
    const agent = new Agent(this, "Agent", { entry: props.agentHandlerEntry, data, memory, model });
    const api = new Api(this, "Api", { entry: props.apiHandlerEntry, data, memory, agentFunction: agent.fn, appPassword });
    const web = new Web(this, "Web", { httpApi: api.httpApi, webDist: props.webDist });

    new CfnOutput(this, "AppUrl", { value: `https://${web.distribution.distributionDomainName}`, description: "Open this in a browser" });
    new CfnOutput(this, "LoginHint", { value: "Log in with the APP_PASSWORD you deployed with" });
    new CfnOutput(this, "Region", { value: this.region });
    new CfnOutput(this, "ModelProvider", { value: props.modelProvider });
    new CfnOutput(this, "ModelId", { value: props.modelProvider === DeployModelProvider.BEDROCK ? MODEL_INFERENCE_PROFILE_ID : ANTHROPIC_MODEL_ID });
    new CfnOutput(this, "MemoryId", { value: memory.memory.attrMemoryId });
    // apps/local-server (DATA_BACKEND=aws) reads the tables, bucket and memory off this function's env.
    new CfnOutput(this, "AgentFunctionName", { value: agent.fn.functionName });
  }
}
