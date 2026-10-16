/**
 * TEMPORARY Track D stub for the Agent Lambda. It proves the function deploys
 * with its env and logs. I3 replaces this file's entry with a thin wrapper
 * around runTurn, and this file is deleted.
 */
export async function handler(event: unknown): Promise<{ ok: true }> {
  console.log(JSON.stringify({ msg: "agent stub invoked", event, modelId: process.env.MODEL_ID }));
  return { ok: true };
}
