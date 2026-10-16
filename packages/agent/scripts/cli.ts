/**
 * Terminal chat with the live model over an in-memory starter pack.
 *
 *   npm run cli -w packages/agent [-- --seed=full|documents]
 *
 * Needs BEDROCK_MODEL_ID and AWS_REGION (see scripts/live/env.ts); fails loudly
 * without them. "Today" is the starter pack's Oct 14, 2026.
 *
 * Commands:
 *   /attach <docId>[,<docId>]   attach documents to your next message
 *   /docs                       list documents
 *   /paste <KIND>               paste a new document (e.g. BILL_TEXT), ending with a line "/end"
 *   /pending                    list pending proposals
 *   /confirm <ref>, /reject <ref>
 *                               stand in for Jordan's button in the app (the UI path; no model involved)
 *   /quit
 */
import type { Interface } from "node:readline/promises";
import { createInterface } from "node:readline/promises";
import { confirmAction, rejectAction, saveDocument, startTurn } from "@helper-assistant/core";
import { DocumentKindSchema, DocumentStorage, PendingActionStatus } from "@helper-assistant/domain";
import type { Id } from "@helper-assistant/domain";
import { starterPackDocuments } from "@helper-assistant/fixtures";
import type { AgentDeps } from "../src/index";
import { PROMPT_VERSION, runTurn } from "../src/index";
import { liveServicesFromEnv } from "./live/env";
import { formatTurn } from "./live/print";
import { seededDeps, SeedMode } from "./live/seed";

type CliState = { sessionId: Id | null; attachments: Id[]; documentIds: Id[] };

function seedModeFromArgs(): SeedMode {
  const arg = process.argv.find((a) => a.startsWith("--seed="))?.slice("--seed=".length) ?? SeedMode.FULL;
  const mode = Object.values(SeedMode).find((m) => m === arg);
  if (mode === undefined) throw new Error(`--seed must be one of ${Object.values(SeedMode).join(", ")}`);
  return mode;
}

async function handle(line: string, deps: AgentDeps, state: CliState, rl: Interface): Promise<void> {
  const [command, argument = ""] = line.split(/\s+/, 2);
  switch (command) {
    case "/attach":
      state.attachments = argument.split(",").filter((id) => id !== "");
      console.log(`Attached to your next message: ${state.attachments.join(", ") || "(none)"}`);
      return;
    case "/docs":
      for (const docId of state.documentIds) {
        const d = await deps.store.getDocument(docId);
        if (d !== null) console.log(`  ${d.docId} (${d.kind})`);
      }
      return;
    case "/paste": {
      const kind = DocumentKindSchema.parse(argument);
      const body: string[] = [];
      for (let next = await rl.question("... "); next !== "/end"; next = await rl.question("... ")) body.push(next);
      const docId = deps.newId();
      await saveDocument(deps, { docId, kind, content: { storage: DocumentStorage.INLINE_TEXT, text: body.join("\n") }, fileName: null, messageDate: null, sessionId: null });
      state.documentIds.push(docId);
      console.log(`Saved ${docId} (${kind}). /attach ${docId} to use it.`);
      return;
    }
    case "/pending":
      for (const a of await deps.store.listActions({ status: PendingActionStatus.PENDING })) console.log(`  #${a.ref} ${a.type}: ${a.summary}`);
      return;
    case "/confirm":
    case "/reject": {
      const ref = Number(argument);
      const action = await deps.store.getAction(ref);
      if (action === null) throw new Error(`No action #${argument}`);
      const resolved =
        command === "/confirm"
          ? await confirmAction(deps, { ref, actionVersion: action.version, messageBody: null })
          : await rejectAction(deps, { ref, actionVersion: action.version });
      console.log(`[UI] #${ref} is now ${resolved.status}${resolved.resolutionNote ? `: ${resolved.resolutionNote}` : ""}`);
      return;
    }
    default: {
      const { turn } = await startTurn(deps, { sessionId: state.sessionId, text: line, attachmentDocIds: state.attachments });
      state.sessionId = turn.sessionId;
      state.attachments = [];
      console.log(await formatTurn(await runTurn({ turnId: turn.turnId, sessionId: turn.sessionId }, deps), deps.store));
    }
  }
}

async function main(): Promise<void> {
  const services = liveServicesFromEnv();
  const mode = seedModeFromArgs();
  const deps = await seededDeps(services, mode);
  console.log(`${services.description}. Seed: ${mode}. Prompt ${PROMPT_VERSION}. Type /quit to exit.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const state: CliState = { sessionId: null, attachments: [], documentIds: starterPackDocuments.map((d) => d.docId) };
  for (let line = (await rl.question("\njordan> ")).trim(); line !== "/quit"; line = (await rl.question("\njordan> ")).trim()) {
    if (line === "") continue;
    try {
      await handle(line, deps, state, rl);
    } catch (error) {
      console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  rl.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
