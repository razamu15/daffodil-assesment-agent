/**
 * Agent runtime limits. These are harness tuning knobs, not domain facts and not
 * environment settings (model ID and region come from the caller, never from here).
 *
 * Call sites: runTurn (history, hints, loop bound), the converse loop and
 * extraction (token and temperature limits).
 */

/** Bump when the system prompt or tool descriptions change, so traces say which prompt produced them. */
export const PROMPT_VERSION = "2026-10-16.1";

/** Chat messages (user + assistant) loaded from memory at turn start. */
export const HISTORY_MAX_MESSAGES = 40;

/** Long-term memory hints injected as background. */
export const HINTS_TOP_K = 5;

/** Model calls one agent turn may make before it gives up loudly. */
export const MAX_AGENT_LOOP_MODEL_CALLS = 24;

export const AGENT_LOOP_MAX_TOKENS = 4096;
export const AGENT_LOOP_TEMPERATURE = 0.2;

export const EXTRACTION_MAX_TOKENS = 8192;
/** Extraction is transcription into a schema: no creativity wanted. */
export const EXTRACTION_TEMPERATURE = 0;
/** A schema-invalid extraction gets this many repair attempts (the zod issues are sent back). */
export const EXTRACTION_REPAIR_ATTEMPTS = 1;
