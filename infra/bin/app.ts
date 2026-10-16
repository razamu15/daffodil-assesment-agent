/**
 * CDK entry. Account from the deployer's credentials (CDK_DEFAULT_ACCOUNT);
 * region pinned in deployConfig (Doc 2 §6). The model API comes from
 * MODEL_PROVIDER (shell or repo .env); there is no default. Secrets (the app
 * password, the Claude API key) are stack parameters passed by scripts/deploy.ts.
 */
import { App } from "aws-cdk-lib";
import { DEPLOY_MODEL_PROVIDERS, DEPLOY_REGION, STACK_NAME } from "../lib/deployConfig";
import { HelperAssistantStack } from "../lib/helper-assistant-stack";
import { AGENT_HANDLER_ENTRY, API_HANDLER_ENTRY, WEB_DIST } from "../lib/paths";
import { loadRepoEnv } from "../lib/repoEnv";

loadRepoEnv();
const modelProvider = DEPLOY_MODEL_PROVIDERS.find((p) => p === process.env.MODEL_PROVIDER?.trim());
if (modelProvider === undefined) throw new Error(`MODEL_PROVIDER must be one of: ${DEPLOY_MODEL_PROVIDERS.join(", ")}. See .env.example.`);

const app = new App();

new HelperAssistantStack(app, STACK_NAME, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: DEPLOY_REGION },
  apiHandlerEntry: API_HANDLER_ENTRY,
  agentHandlerEntry: AGENT_HANDLER_ENTRY,
  webDist: WEB_DIST,
  modelProvider,
});
