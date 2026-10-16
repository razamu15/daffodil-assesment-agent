/**
 * The API Lambda behind an HTTP API: auth, reads, uploads, confirm and approve.
 * The only thing that commits changes (Doc 2 §2). Starts agent turns by async
 * invoke of the Agent Lambda.
 */
import type { CfnParameter } from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import type { Data } from "./data";
import { nodeFunction } from "./nodeFunction";

export type ApiProps = {
  entry: string;
  data: Data;
  agentFunction: NodejsFunction;
  /** NoEcho stack parameter, so the password never lands in the synthesized template. */
  appPassword: CfnParameter;
};

export class Api extends Construct {
  readonly fn: NodejsFunction;
  readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.fn = nodeFunction(this, "Function", {
      entry: props.entry,
      timeout: Duration.seconds(29),
      memorySize: 512,
      environment: {
        APP_PASSWORD: props.appPassword.valueAsString,
        AGENT_FUNCTION_NAME: props.agentFunction.functionName,
        UPLOADS_BUCKET: props.data.uploadsBucket.bucketName,
        ...props.data.tableEnvironment(),
      },
    });

    for (const { table } of props.data.tables) table.grantReadWriteData(this.fn);
    props.data.uploadsBucket.grantReadWrite(this.fn);
    props.agentFunction.grantInvoke(this.fn);

    this.httpApi = new HttpApi(this, "HttpApi", { createDefaultStage: true });
    this.httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", this.fn),
    });
  }
}
