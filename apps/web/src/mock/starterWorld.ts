/**
 * The starter pack as a MockWorld: Jordan's helpers, confirmed terms, the eight
 * documents and the three September bills, each checked by the real checker.
 * Built only from @helper-assistant/fixtures; anything the fixtures don't have
 * is added per scenario in scenarioData.ts with explicit values.
 */
import { ChatRole, DocumentStorage } from "@helper-assistant/domain";
import type { ChatRole as ChatRoleT, Id, Session } from "@helper-assistant/domain";
import { starterPackBills, starterPackDocuments, starterPackHelpers, starterPackTerms } from "@helper-assistant/fixtures";
import { withCheck } from "./checks";
import { STARTER_PACK_IMAGE_BASE64 } from "./images";
import { MockWorld } from "./world";

/** Adds a chat with its messages, in order. Call sites: starter world and scenario data. */
export function addSession(world: MockWorld, title: string, messages: [ChatRoleT, string][]): Id {
  const createdAt = world.now();
  const sessionId = world.newId("session");
  world.chat.set(
    sessionId,
    messages.map(([role, text]) => ({ role, text, at: world.now() })),
  );
  const session: Session = { sessionId, title, createdAt, lastActiveAt: world.now(), activeTurnId: null, version: 1 };
  world.sessions.push(session);
  return sessionId;
}

export function starterWorld(): MockWorld {
  const world = new MockWorld();
  world.helpers = structuredClone(starterPackHelpers);
  world.terms = structuredClone(starterPackTerms);
  world.documents = structuredClone(starterPackDocuments);
  for (const doc of world.documents) {
    const image = STARTER_PACK_IMAGE_BASE64.get(doc.docId);
    if (doc.content.storage === DocumentStorage.BLOB && image !== undefined) world.blobs.set(doc.docId, image);
  }
  world.bills = structuredClone(starterPackBills).map((bill) => withCheck(world, bill));

  addSession(world, "Getting set up", [
    [ChatRole.USER, "Here's everything I have about our helpers: my notes, and the texts with Priya, Lupe and Theo."],
    [
      ChatRole.ASSISTANT,
      "I read 5 documents and proposed 7 agreements, which you confirmed. One thing to know: your notes say Theo charges $25 a walk, but his Aug 27 text says $28 for a 30-minute walk from September. I used the text, since it's newer and comes from Theo.",
    ],
    [ChatRole.USER, "And here are the September bills."],
    [
      ChatRole.ASSISTANT,
      "I checked all three. Theo's checks out. Lupe billed $150 on Sep 1 and Sep 8, but her new rate only started Sep 15. Priya's bill has a $40 last-minute fee that isn't in your agreement, and her total says $626 while the lines add up to $596.",
    ],
  ]);
  return world;
}
