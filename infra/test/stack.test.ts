/**
 * Template assertions for the Track D gate: tables and GSIs, everything
 * destroyable, no async retries, stack-owned log groups, memory wiring, and no
 * account ID in the source.
 */
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { DEPLOY_REGION, MODEL_INFERENCE_PROFILE_ID, STACK_NAME } from "../lib/deployConfig";
import { HelperAssistantStack } from "../lib/helper-assistant-stack";
import { AGENT_HANDLER_ENTRY, API_HANDLER_ENTRY, INFRA_ROOT } from "../lib/paths";
import { TABLE_SPECS } from "../lib/tableSpecs";

let template: Template;

type Resource = { Type: string; Properties?: Record<string, unknown>; DeletionPolicy?: string };

const resourcesOfType = (type: string): Resource[] =>
  Object.values(template.toJSON().Resources as Record<string, Resource>).filter((resource) => resource.Type === type);

const envOf = (fn: Resource): Record<string, unknown> =>
  (fn.Properties?.Environment as { Variables?: Record<string, unknown> } | undefined)?.Variables ?? {};

/** Our two functions (API and agent): the only ones given table names. CDK's helper Lambdas aren't. */
const appFunctions = (): Resource[] => {
  const functions = resourcesOfType("AWS::Lambda::Function").filter((fn) => TABLE_SPECS[0]!.envVar in envOf(fn));
  expect(functions).toHaveLength(2);
  return functions;
};

beforeAll(() => {
  const webDist = mkdtempSync(join(tmpdir(), "web-dist-"));
  writeFileSync(join(webDist, "index.html"), "<!doctype html>");
  const app = new App();
  const stack = new HelperAssistantStack(app, STACK_NAME, {
    env: { region: DEPLOY_REGION },
    apiHandlerEntry: API_HANDLER_ENTRY,
    agentHandlerEntry: AGENT_HANDLER_ENTRY,
    webDist,
  });
  template = Template.fromStack(stack);
}, 120_000);

describe("data", () => {
  it("creates one on-demand, destroyable table per spec with its keys and GSIs", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", TABLE_SPECS.length);
    for (const spec of TABLE_SPECS) {
      template.hasResource("AWS::DynamoDB::Table", {
        DeletionPolicy: "Delete",
        Properties: Match.objectLike({
          BillingMode: "PAY_PER_REQUEST",
          KeySchema: [{ AttributeName: spec.partitionKey.name, KeyType: "HASH" }],
          ...(spec.indexes.length === 0
            ? {}
            : { GlobalSecondaryIndexes: spec.indexes.map((index) => Match.objectLike({ IndexName: index.indexName })) }),
        }),
      });
    }
  });

  it("gives both Lambdas every table name", () => {
    for (const fn of appFunctions()) {
      for (const spec of TABLE_SPECS) expect(envOf(fn)).toHaveProperty(spec.envVar);
    }
  });
});

describe("teardown", () => {
  it("destroys and empties both buckets", () => {
    const buckets = resourcesOfType("AWS::S3::Bucket");
    expect(buckets).toHaveLength(2);
    for (const bucket of buckets) expect(bucket.DeletionPolicy).toBe("Delete");
    template.resourceCountIs("Custom::S3AutoDeleteObjects", 2);
  });

  it("owns a destroyable log group for each of our Lambdas and the UI deployment", () => {
    for (const fn of appFunctions()) expect(fn.Properties?.LoggingConfig).toMatchObject({ LogGroup: expect.anything() });
    for (const logGroup of resourcesOfType("AWS::Logs::LogGroup")) expect(logGroup.DeletionPolicy).toBe("Delete");
    template.resourceCountIs("AWS::Logs::LogGroup", 3);
  });
});

describe("agent", () => {
  it("never retries an async turn", () => {
    template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", { MaximumRetryAttempts: 0 });
  });

  it("runs the pinned model", () => {
    const agent = appFunctions().find((fn) => "MODEL_ID" in envOf(fn));
    expect(agent && envOf(agent).MODEL_ID).toBe(MODEL_INFERENCE_PROFILE_ID);
  });
});

describe("memory", () => {
  it("has semantic and user-preference strategies on the configured namespaces", () => {
    template.hasResourceProperties("AWS::BedrockAgentCore::Memory", {
      MemoryStrategies: [
        { SemanticMemoryStrategy: Match.objectLike({ Namespaces: ["/households/{actorId}/semantic"] }) },
        { UserPreferenceMemoryStrategy: Match.objectLike({ Namespaces: ["/households/{actorId}/preferences"] }) },
      ],
    });
  });

  it("hands the agent both hint namespaces, with the actor filled in", () => {
    const agent = appFunctions().find((fn) => "AGENTCORE_HINT_NAMESPACES" in envOf(fn));
    expect(agent && envOf(agent).AGENTCORE_HINT_NAMESPACES).toBe(
      "SEMANTIC=/households/household/semantic,PREFERENCE=/households/household/preferences",
    );
  });
});

describe("secrets and settings", () => {
  it("keeps the password out of the template (NoEcho parameter)", () => {
    template.hasParameter("AppPassword", { Type: "String", NoEcho: true });
  });

  it("has no AWS account ID literal in the infra source", () => {
    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
      });
    for (const dir of ["bin", "lib", "lambda", "scripts"]) {
      for (const file of sourceFiles(join(INFRA_ROOT, dir))) expect(readFileSync(file, "utf8"), file).not.toMatch(/\b\d{12}\b/);
    }
  });
});
