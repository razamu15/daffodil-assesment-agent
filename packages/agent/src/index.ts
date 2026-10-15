/**
 * @helper-assistant/agent — Track B, "the brain".
 *
 * The hand-rolled Converse loop (runTurn), the tools over domain
 * toolInputSchemas, quarantined extraction, the system prompt, the memory
 * adapters, the model clients and the in-process turn runner. The assistant
 * proposes and never commits: no tool here confirms, approves, sends or deletes.
 */
export type { AgentDeps } from "./deps";
export { PROMPT_VERSION } from "./settings";

export { runTurn } from "./loop/runTurn";
export { AgentLoopError } from "./loop/converseLoop";
export { LocalTurnRunner } from "./runner/localTurnRunner";

export { dispatchTool, TOOL_HANDLERS, TOOL_NAMES, toolSpecs } from "./tools/registry";
export { emptyTrace } from "./tools/context";
export type { ChatStatement, ToolContext, TurnTrace } from "./tools/context";
export { TOOL_ERROR_BY_CORE_ERROR, ToolFailure } from "./tools/errors";
export { TOOL_DESCRIPTIONS } from "./prompt/toolDescriptions";
export { systemPrompt } from "./prompt/systemPrompt";

export { extractDocument, matchHelpers } from "./extraction/extract";
export type { HelperMatch } from "./extraction/extract";
export { EXTRACTION_OUTPUT_TOOL } from "./extraction/outputTools";

export { BedrockModel, bedrockConverseApi, fromConverseOutput, toConverseInput } from "./model/bedrockModel";
export type { BedrockConverseApi } from "./model/bedrockModel";
export { FakeModel, lastToolResults } from "./model/fakeModel";
export type { FakeModelStep } from "./model/fakeModel";

export { InMemoryMemory } from "./memory/inMemoryMemory";
export { AgentCoreMemory, agentCoreMemoryApi } from "./memory/agentCoreMemory";
export type { AgentCoreMemoryApi, AgentCoreMemoryConfig } from "./memory/agentCoreMemory";

export { commitSnapshot, noCommitViolations } from "./audit/noCommitAudit";
export type { CommitSnapshot } from "./audit/noCommitAudit";
