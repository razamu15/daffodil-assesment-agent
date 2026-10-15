/**
 * The forced output "tool" per extraction kind (Doc 3 §4.4). The quarantined call
 * gets exactly this one tool and toolChoice forces it, so the only thing the
 * model can do with an untrusted document is fill the schema. The tool does
 * nothing when "called": its input is the answer.
 *
 * Call site: extractDocument.
 */
import { AgreementExtractionSchema, BillExtractionSchema, ExtractionKind } from "@helper-assistant/domain";
import type { ExtractionKind as ExtractionKindT, ModelToolSpec } from "@helper-assistant/domain";
import type { z } from "zod";
import { toModelJsonSchema } from "../jsonSchema";

export type ExtractionOutputTool = { spec: ModelToolSpec; schema: z.ZodType };

const outputTool = (name: string, description: string, schema: z.ZodType): ExtractionOutputTool => ({
  spec: { name, description, inputSchema: toModelJsonSchema(schema) },
  schema,
});

export const EXTRACTION_OUTPUT_TOOL: Record<ExtractionKindT, ExtractionOutputTool> = {
  [ExtractionKind.AGREEMENT]: outputTool(
    "submit_agreement_extraction",
    "Submit what the document says about helpers and their agreed terms. Unstated fields are null; every inference goes in an assumptions list.",
    AgreementExtractionSchema,
  ),
  [ExtractionKind.BILL]: outputTool(
    "submit_bill_extraction",
    "Submit the bill exactly as the helper wrote it, line by line. Unstated fields are null; every inference goes in assumptions.",
    BillExtractionSchema,
  ),
};
