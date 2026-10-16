/**
 * `npm run destroy`: delete the stack, then the log groups CDK's own helper
 * Lambdas leave behind (Doc 2 §7, "Teardown"). CDKToolkit is kept on purpose.
 *
 * Deletes through CloudFormation directly rather than `cdk destroy`: deleting
 * needs only the stack name, so teardown doesn't synthesize the app (no
 * settings, no Lambda bundling). The KMS key of a MODEL_PROVIDER=anthropic
 * deploy is scheduled for deletion (KMS's 7-day minimum wait), not deleted at once.
 */
import { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand, waitUntilStackDeleteComplete } from "@aws-sdk/client-cloudformation";
import { DEPLOY_REGION, STACK_NAME } from "../lib/deployConfig";
import { deleteLeftoverLogGroups } from "./cleanupLogGroups";

const STACK_DELETE_TIMEOUT_SECONDS = 30 * 60;

const cloudFormation = new CloudFormationClient({ region: DEPLOY_REGION });
const exists = await cloudFormation.send(new DescribeStacksCommand({ StackName: STACK_NAME })).then(
  () => true,
  (error: unknown) => {
    if (error instanceof Error && error.message.includes("does not exist")) return false;
    throw error;
  },
);
if (exists) {
  console.log(`Deleting stack ${STACK_NAME} in ${DEPLOY_REGION}…`);
  await cloudFormation.send(new DeleteStackCommand({ StackName: STACK_NAME }));
  await waitUntilStackDeleteComplete({ client: cloudFormation, maxWaitTime: STACK_DELETE_TIMEOUT_SECONDS }, { StackName: STACK_NAME });
  console.log(`Stack ${STACK_NAME} deleted.`);
} else {
  console.log(`Stack ${STACK_NAME} doesn't exist in ${DEPLOY_REGION}; nothing to delete.`);
}
await deleteLeftoverLogGroups();
