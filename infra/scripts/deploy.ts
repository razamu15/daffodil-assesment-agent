/**
 * `npm run deploy`: check settings, build the UI, bootstrap (a no-op when
 * already done), then deploy (Doc 2 §7). Fails before touching AWS if a
 * setting is missing.
 *
 * Settings come from the shell or the repo-root .env (shell wins):
 *   APP_PASSWORD       the app's login password
 *   MODEL_PROVIDER     bedrock | anthropic (deployConfig DeployModelProvider)
 *   ANTHROPIC_API_KEY  with anthropic only; stored in Secrets Manager by the stack
 */
import { DEPLOY_REGION, DeployModelProvider, DEPLOY_MODEL_PROVIDERS, STACK_NAME } from "../lib/deployConfig";
import { INFRA_ROOT, REPO_ROOT } from "../lib/paths";
import { loadRepoEnv } from "../lib/repoEnv";
import { run } from "./run";

function fail(message: string): never {
  console.error(`${message}\n\nSet it in the shell or the repo-root .env (see .env.example), then run npm run deploy again.`);
  process.exit(1);
}

loadRepoEnv();
const setting = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? null : value;
};

const appPassword = setting("APP_PASSWORD") ?? fail("APP_PASSWORD is not set: choose the app's login password.");
const modelProvider =
  DEPLOY_MODEL_PROVIDERS.find((p) => p === setting("MODEL_PROVIDER")) ?? fail(`MODEL_PROVIDER must be one of: ${DEPLOY_MODEL_PROVIDERS.join(", ")}.`);
const parameters = [`AppPassword=${appPassword}`];
if (modelProvider === DeployModelProvider.ANTHROPIC) {
  parameters.push(`AnthropicApiKey=${setting("ANTHROPIC_API_KEY") ?? fail("ANTHROPIC_API_KEY is not set (needed for MODEL_PROVIDER=anthropic).")}`);
}

console.log(`Deploying stack ${STACK_NAME} to ${DEPLOY_REGION} with MODEL_PROVIDER=${modelProvider}.`);
run("npm", ["run", "build", "-w", "@helper-assistant/web"], REPO_ROOT);
run("npx", ["cdk", "bootstrap"], INFRA_ROOT);
run("npx", ["cdk", "deploy", STACK_NAME, "--require-approval", "never", ...parameters.flatMap((p) => ["--parameters", p])], INFRA_ROOT);
