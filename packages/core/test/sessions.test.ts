/** The session lock: one turn at a time, and a stuck turn's lock expires (TURN_LOCK_EXPIRY_MS). */
import { describe, expect, it } from "vitest";
import { FixedClock, TURN_LOCK_EXPIRY_MS, TurnStatus } from "@helper-assistant/domain";
import { CoreErrorCode, startTurn } from "../src/index";
import { starterPackDeps } from "./harness";

const START = "2026-10-14T12:00:00.000Z";
const later = (ms: number) => new FixedClock({ now: new Date(Date.parse(START) + ms).toISOString(), today: "2026-10-14" });

describe("session lock", () => {
  it("refuses a second turn while the first may still be running", async () => {
    const deps = { ...(await starterPackDeps()), clock: later(0) };
    const { session } = await startTurn(deps, { sessionId: null, text: "hi", attachmentDocIds: [] });
    const withinExpiry = { ...deps, clock: later(TURN_LOCK_EXPIRY_MS - 1000) };
    await expect(startTurn(withinExpiry, { sessionId: session.sessionId, text: "again", attachmentDocIds: [] })).rejects.toMatchObject({ code: CoreErrorCode.SESSION_BUSY });
  });

  it("takes over a lock held past the expiry, failing the stuck turn", async () => {
    const deps = { ...(await starterPackDeps()), clock: later(0) };
    const { session, turn: stuck } = await startTurn(deps, { sessionId: null, text: "hi", attachmentDocIds: [] });
    const afterExpiry = { ...deps, clock: later(TURN_LOCK_EXPIRY_MS + 1000) };
    const { session: retaken, turn } = await startTurn(afterExpiry, { sessionId: session.sessionId, text: "again", attachmentDocIds: [] });
    expect(retaken.activeTurnId).toBe(turn.turnId);
    expect(await deps.store.getTurn(stuck.turnId)).toMatchObject({ status: TurnStatus.FAILED, error: expect.stringMatching(/timed out or crashed/) });
  });
});
