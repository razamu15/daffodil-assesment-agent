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
import { MODEL_INFERENCE_PROFILE_ID } from "./deployConfig";

export type HelperAssistantStackProps = StackProps & {
  apiHandlerEntry: string;
  agentHandlerEntry: string;
  webDist: string;
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

    const data = new Data(this, "Data");
    const memory = new Memory(this, "Memory");
    const agent = new Agent(this, "Agent", { entry: props.agentHandlerEntry, data, memory });
    const api = new Api(this, "Api", { entry: props.apiHandlerEntry, data, agentFunction: agent.fn, appPassword });
    const web = new Web(this, "Web", { httpApi: api.httpApi, webDist: props.webDist });

    new CfnOutput(this, "AppUrl", { value: `https://${web.distribution.distributionDomainName}`, description: "Open this in a browser" });
    new CfnOutput(this, "LoginHint", { value: "Log in with the APP_PASSWORD you deployed with" });
    new CfnOutput(this, "Region", { value: this.region });
    new CfnOutput(this, "ModelId", { value: MODEL_INFERENCE_PROFILE_ID });
    new CfnOutput(this, "MemoryId", { value: memory.memory.attrMemoryId });
    // apps/local-server (DATA_BACKEND=aws) reads the tables, bucket and memory off this function's env.
    new CfnOutput(this, "AgentFunctionName", { value: agent.fn.functionName });
  }
}
