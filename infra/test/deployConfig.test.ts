/** The deploy-time model providers must be the ones the agent's modelFromSettings accepts. */
import { describe, expect, it } from "vitest";
import { ModelProvider } from "../../packages/agent/src/model/modelProvider";
import { DEPLOY_MODEL_PROVIDERS } from "../lib/deployConfig";

describe("deployConfig", () => {
  it("offers exactly the agent's model providers", () => {
    expect([...DEPLOY_MODEL_PROVIDERS].sort()).toEqual(Object.values(ModelProvider).sort());
  });
});
