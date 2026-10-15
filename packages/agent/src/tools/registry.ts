/**
 * The tool registry: the model's whole capability surface.
 *
 * Exactly the tools in domain toolInputSchemas, no more. confirm, approve, send,
 * edit-approved and delete paths are absent on purpose (Doc 3 §4.3); that
 * absence is the safety, so a model asking for any other name gets an error,
 * not an action.
 *
 * dispatchTool is the single validation boundary: input is parsed with the
 * tool's domain schema here and handlers trust it. Every outcome is the
 * ToolResult envelope.
 *
 * Call sites: the converse loop (toolSpecs, dispatchTool), agent tests.
 */
import { ToolErrorCode, toolInputSchemas } from "@helper-assistant/domain";
import type { ModelToolSpec, ToolName, ToolResult } from "@helper-assistant/domain";
import { z } from "zod";
import { extractHandlers } from "../extraction/extract";
import { toModelJsonSchema } from "../jsonSchema";
import { TOOL_DESCRIPTIONS } from "../prompt/toolDescriptions";
import type { ToolContext, ToolHandler, ToolHandlers } from "./context";
import { toToolError } from "./errors";
import { escapeHandlers } from "./escape";
import { proposeHandlers } from "./propose";
import { readHandlers } from "./read";
import { recordHandlers } from "./record";

export const TOOL_HANDLERS: ToolHandlers = {
  ...readHandlers,
  ...extractHandlers,
  ...recordHandlers,
  ...proposeHandlers,
  ...escapeHandlers,
};

export const TOOL_NAMES = Object.keys(toolInputSchemas) as ToolName[];

const isToolName = (name: string): name is ToolName => Object.hasOwn(toolInputSchemas, name);

/** Built once: the schemas are static. */
export const toolSpecs: ModelToolSpec[] = TOOL_NAMES.map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: toModelJsonSchema(toolInputSchemas[name]),
}));

export async function dispatchTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult<unknown>> {
  if (!isToolName(name)) {
    return { ok: false, error: { code: ToolErrorCode.INVALID_INPUT, message: `There is no tool named "${name}". You can only use the tools you were given.` } };
  }
  const parsed = toolInputSchemas[name].safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: ToolErrorCode.INVALID_INPUT, message: z.prettifyError(parsed.error) } };
  }
  try {
    const handler = TOOL_HANDLERS[name] as ToolHandler<ToolName>;
    return { ok: true, data: await handler(parsed.data as never, ctx) };
  } catch (error) {
    return { ok: false, error: toToolError(error) };
  }
}
