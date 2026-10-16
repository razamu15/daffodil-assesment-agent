/**
 * `npm run deploy`: check APP_PASSWORD, build the UI, bootstrap (a no-op when
 * already done), then deploy (Doc 2 §7). Fails before touching AWS if the
 * password is missing.
 */
import { DEPLOY_REGION, STACK_NAME } from "../lib/deployConfig";
import { INFRA_ROOT, REPO_ROOT } from "../lib/paths";
import { run } from "./run";

const appPassword = process.env.APP_PASSWORD;
if (appPassword === undefined || appPassword.trim() === "") {
  console.error("APP_PASSWORD is not set. Choose the app's login password and run:\n\n  APP_PASSWORD='choose-one' npm run deploy\n");
  process.exit(1);
}

console.log(`Deploying stack ${STACK_NAME} to ${DEPLOY_REGION}.`);
run("npm", ["run", "build", "-w", "@helper-assistant/web"], REPO_ROOT);
run("npx", ["cdk", "bootstrap"], INFRA_ROOT);
run("npx", ["cdk", "deploy", STACK_NAME, "--require-approval", "never", "--parameters", `AppPassword=${appPassword}`], INFRA_ROOT);
