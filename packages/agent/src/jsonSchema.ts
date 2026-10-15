/**
 * zod schema → JSON Schema for a model tool spec (ModelToolSpec.inputSchema).
 *
 * The zod schema stays the validator; the JSON Schema only tells the model the
 * shape. Two trims keep the prompt small without loosening anything that is
 * enforced: the `$schema` header, and the long regex zod emits beside
 * `format: "date"` (the format and description already say YYYY-MM-DD, and zod
 * re-checks the value at the tool boundary).
 *
 * Call sites: the agent tool registry (every tool's spec) and extraction (the
 * forced output tools).
 */
import { z } from "zod";

export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return trimDatePatterns(withoutSchemaHeader(z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>)) as Record<string, unknown>;
}

const withoutSchemaHeader = ({ $schema: _header, ...json }: Record<string, unknown>) => json;

function trimDatePatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(trimDatePatterns);
  if (node === null || typeof node !== "object") return node;
  const entries = Object.entries(node as Record<string, unknown>);
  const isDate = entries.some(([key, value]) => key === "format" && value === "date");
  return Object.fromEntries(entries.filter(([key]) => !(isDate && key === "pattern")).map(([key, value]) => [key, trimDatePatterns(value)]));
}
