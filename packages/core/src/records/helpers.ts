/**
 * Helper profiles save directly, without a confirmation step (Product P14, Doc 3
 * §10 C5). Updates are still version-checked so two edits can't silently clobber
 * each other. Status and endedOn change only through HELPER_ENGAGEMENT_END.
 *
 * Call sites: api POST /api/helpers and POST /api/helpers/:id; the agent's
 * save_helper tool (create when helperId is null; otherwise read the current
 * version and update).
 */
import { HelperStatus, StoreCommitError, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { Helper, HelperProfile, Id } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";

export async function createHelper({ store, newId }: Pick<CoreDeps, "store" | "newId">, profile: HelperProfile): Promise<Helper> {
  const helper: Helper = { ...profile, helperId: newId(), status: HelperStatus.ACTIVE, endedOn: null, version: 1 };
  await store.commit([{ record: { entity: StoredEntity.HELPER, value: helper }, condition: { kind: WriteConditionKind.ABSENT } }]);
  return helper;
}

export async function updateHelperProfile(
  { store }: Pick<CoreDeps, "store">,
  { helperId, expectedVersion, profile }: { helperId: Id; expectedVersion: number; profile: HelperProfile },
): Promise<Helper> {
  const current = await store.getHelper(helperId);
  if (current === null) throw notFound("Helper", helperId);
  const conflict = new CoreError(CoreErrorCode.CONFLICT, `${current.name}'s profile changed (version ${current.version}, you saw ${expectedVersion}). Reload it.`);
  if (current.version !== expectedVersion) throw conflict;
  const updated: Helper = { ...current, ...profile, version: current.version + 1 };
  try {
    await store.commit([{ record: { entity: StoredEntity.HELPER, value: updated }, condition: { kind: WriteConditionKind.VERSION, expected: expectedVersion } }]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw conflict;
    throw error;
  }
  return updated;
}
