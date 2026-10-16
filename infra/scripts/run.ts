/**
 * Runs a command with inherited output and exits on failure, so each script
 * step stops the chain loudly.
 *
 * Call sites: scripts/deploy.ts, scripts/destroy.ts.
 */
import { spawnSync } from "node:child_process";

export function run(command: string, args: string[], cwd: string): void {
  // Stack parameters carry secrets (password, API key): echo the names only.
  const shown = args.map((arg, i) => (args[i - 1] === "--parameters" ? `${arg.split("=")[0]}=****` : arg));
  console.log(`\n> ${command} ${shown.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    console.error(`\nFailed: ${command} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
