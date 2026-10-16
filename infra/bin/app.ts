/**
 * CDK entry. Account from the deployer's credentials (CDK_DEFAULT_ACCOUNT);
 * region pinned in deployConfig (Doc 2 §6). The app password is a stack
 * parameter, passed by scripts/deploy.ts, so `cdk destroy` doesn't need it.
 */
import { App } from "aws-cdk-lib";
import { DEPLOY_REGION, STACK_NAME } from "../lib/deployConfig";
import { HelperAssistantStack } from "../lib/helper-assistant-stack";
import { AGENT_HANDLER_ENTRY, API_HANDLER_ENTRY, WEB_DIST } from "../lib/paths";

const app = new App();

new HelperAssistantStack(app, STACK_NAME, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: DEPLOY_REGION },
  apiHandlerEntry: API_HANDLER_ENTRY,
  agentHandlerEntry: AGENT_HANDLER_ENTRY,
  webDist: WEB_DIST,
});
