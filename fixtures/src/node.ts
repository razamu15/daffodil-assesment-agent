/**
 * Node-only access to the raw starter-pack files in fixtures/starter-pack/.
 * Call sites: agent extraction goldens (send the real screenshots to the model),
 * local-server seeding, the fixture drift test.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { starterPackFileByDocId } from "./starterPack/documents";

export const STARTER_PACK_DIR = fileURLToPath(new URL("../starter-pack/", import.meta.url));

export async function readStarterPackFile(docId: string): Promise<Uint8Array> {
  const fileName = starterPackFileByDocId[docId];
  if (!fileName) throw new Error(`No starter-pack file for document ${docId}`);
  return new Uint8Array(await readFile(new URL(fileName, `file://${STARTER_PACK_DIR}`)));
}
