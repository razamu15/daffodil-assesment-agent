/**
 * Live scenario runner: extraction goldens (each starter-pack document, 3×) and
 * scripted conversations, with every turn's transcript and trace printed and
 * audited for commits.
 *
 *   npm run scenarios -w packages/agent [-- --only=goldens|conversations] [-- --runs=3]
 *
 * Needs BEDROCK_MODEL_ID and AWS_REGION (see scripts/live/env.ts). Exits 1 if
 * any expectation or audit fails. Never part of `npm test`.
 */
import { startTurn } from "@helper-assistant/core";
import { starterPackDocuments } from "@helper-assistant/fixtures";
import { commitSnapshot, noCommitViolations, PROMPT_VERSION, runTurn } from "../src/index";
import { liveServicesFromEnv } from "./live/env";
import type { LiveServices } from "./live/env";
import { formatTurn } from "./live/print";
import { seededDeps, SeedMode } from "./live/seed";
import { CONVERSATIONS } from "./scenarios/conversations";
import { BILL_DOC_IDS, runExtractionGoldens } from "./scenarios/extractionGoldens";

const DEFAULT_RUNS = 3;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

async function goldens(services: LiveServices, runs: number): Promise<number> {
  console.log(`\n=== Extraction goldens (${runs}× each) ===`);
  // Agreements are read as on day one (no known service keys); bills with the confirmed terms in place.
  const agreementDocs = starterPackDocuments.filter((d) => !BILL_DOC_IDS.includes(d.docId));
  const billDocs = starterPackDocuments.filter((d) => BILL_DOC_IDS.includes(d.docId));
  const results = [
    ...(await runExtractionGoldens(await seededDeps(services, SeedMode.DOCUMENTS), agreementDocs, runs)),
    ...(await runExtractionGoldens(await seededDeps(services, SeedMode.FULL), billDocs, runs)),
  ];
  for (const r of results) {
    console.log(`${r.problems.length === 0 ? "PASS" : "FAIL"}  ${r.docId} run ${r.run} (${r.tokens} tokens)`);
    for (const p of r.problems) console.log(`      - ${p}`);
  }
  return results.filter((r) => r.problems.length > 0).length;
}

async function conversations(services: LiveServices): Promise<number> {
  let failures = 0;
  for (const conversation of CONVERSATIONS) {
    console.log(`\n=== ${conversation.name} (seed: ${conversation.seed}) ===`);
    const deps = await seededDeps(services, conversation.seed);
    await conversation.setup?.(deps);
    const turns = [];
    const problems: string[] = [];
    let sessionId: string | null = null;
    for (const { text, attachmentDocIds } of conversation.turns) {
      console.log(`\njordan> ${text}${attachmentDocIds.length > 0 ? ` [attached: ${attachmentDocIds.join(", ")}]` : ""}`);
      const before = await commitSnapshot(deps.store);
      const { turn } = await startTurn(deps, { sessionId, text, attachmentDocIds });
      sessionId = turn.sessionId;
      const finished = await runTurn({ turnId: turn.turnId, sessionId: turn.sessionId }, deps);
      console.log(await formatTurn(finished, deps.store));
      problems.push(...noCommitViolations(finished, before, await commitSnapshot(deps.store)).map((v) => `COMMIT AUDIT: ${v}`));
      if (finished.status !== "COMPLETED") problems.push(`turn ${finished.status}: ${finished.error}`);
      turns.push(finished);
    }
    problems.push(...(await conversation.expect(turns, deps.store)));
    console.log(`\n${problems.length === 0 ? "PASS" : "FAIL"}  ${conversation.name}`);
    for (const p of problems) console.log(`      - ${p}`);
    if (problems.length > 0) failures++;
  }
  return failures;
}

async function main(): Promise<void> {
  const services = liveServicesFromEnv();
  const only = arg("only");
  const runs = Number(arg("runs") ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
  console.log(`${services.description}. Prompt ${PROMPT_VERSION}.`);
  const failures = (only === "conversations" ? 0 : await goldens(services, runs)) + (only === "goldens" ? 0 : await conversations(services));
  console.log(`\n${failures === 0 ? "All scenarios passed." : `${failures} scenario(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
