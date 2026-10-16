/**
 * Deletes the log groups that outlive the stack:
 *  - `/aws/lambda/<STACK_NAME>-*`: created by CDK's internal helper Lambdas
 *    (e.g. the autoDeleteObjects provider), which the stack can't declare.
 *  - `<STACK_NAME>-*`: our stack-owned groups. CloudFormation deletes them, but
 *    a helper Lambda that runs during teardown (the UI BucketDeployment) can log
 *    after its group was deleted, and Lambda re-creates it.
 *
 * Both prefixes start with the stack name, so nothing outside this app matches.
 *
 * Call site: scripts/destroy.ts, after the stack is deleted.
 */
import { CloudWatchLogsClient, DeleteLogGroupCommand, paginateDescribeLogGroups } from "@aws-sdk/client-cloudwatch-logs";
import { DEPLOY_REGION, STACK_NAME } from "../lib/deployConfig";

export const LEFTOVER_LOG_GROUP_PREFIXES = [`/aws/lambda/${STACK_NAME}-`, `${STACK_NAME}-`];

export async function deleteLeftoverLogGroups(): Promise<void> {
  const client = new CloudWatchLogsClient({ region: DEPLOY_REGION });
  const names: string[] = [];
  for (const logGroupNamePrefix of LEFTOVER_LOG_GROUP_PREFIXES) {
    for await (const page of paginateDescribeLogGroups({ client }, { logGroupNamePrefix })) {
      for (const group of page.logGroups ?? []) if (group.logGroupName !== undefined) names.push(group.logGroupName);
    }
  }
  if (names.length === 0) {
    console.log(`\nNo leftover log groups (${LEFTOVER_LOG_GROUP_PREFIXES.join(", ")}).`);
    return;
  }
  for (const logGroupName of names) {
    await client.send(new DeleteLogGroupCommand({ logGroupName }));
    console.log(`Deleted log group ${logGroupName}`);
  }
}
