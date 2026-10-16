/**
 * One way to build our Lambdas: esbuild bundling on the host (no Docker), Node 22
 * on arm64, and a log group the stack owns so `cdk destroy` removes it.
 *
 * Call sites: constructs/agent.ts and constructs/api.ts.
 */
import type { Duration } from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { REPO_ROOT } from "../paths";

export type NodeFunctionProps = {
  /** Handler file (absolute path). A prop, so the I3 swap from stub to real handler is one path. */
  entry: string;
  timeout: Duration;
  memorySize: number;
  environment: Record<string, string>;
};

export function nodeFunction(scope: Construct, id: string, props: NodeFunctionProps): NodejsFunction {
  const logGroup = new LogGroup(scope, `${id}Logs`, {
    retention: RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  return new NodejsFunction(scope, id, {
    entry: props.entry,
    handler: "handler",
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    timeout: props.timeout,
    memorySize: props.memorySize,
    environment: props.environment,
    logGroup,
    projectRoot: REPO_ROOT,
    depsLockFilePath: `${REPO_ROOT}/package-lock.json`,
    bundling: { target: "node22", sourceMap: true },
  });
}
