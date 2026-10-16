/**
 * `npm run destroy`: delete the stack, then the log groups CDK's own helper
 * Lambdas leave behind (Doc 2 §7, "Teardown"). CDKToolkit is kept on purpose.
 */
import { STACK_NAME } from "../lib/deployConfig";
import { INFRA_ROOT } from "../lib/paths";
import { deleteLeftoverLogGroups } from "./cleanupLogGroups";
import { run } from "./run";

run("npx", ["cdk", "destroy", STACK_NAME, "--force"], INFRA_ROOT);
await deleteLeftoverLogGroups();
