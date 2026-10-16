/**
 * Runs a command with inherited output and exits on failure, so each script
 * step stops the chain loudly.
 *
 * Call sites: scripts/deploy.ts, scripts/destroy.ts.
 */
import { spawnSync } from "node:child_process";

export function run(command: string, args: string[], cwd: string): void {
  console.log(`\n> ${command} ${args.map((arg) => (arg.startsWith("AppPassword=") ? "AppPassword=****" : arg)).join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    console.error(`\nFailed: ${command} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
