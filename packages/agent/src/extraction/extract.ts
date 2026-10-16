/**
 * extract_from_document: the quarantined call (Doc 3 §4.4, cheatsheet §7.4).
 *
 * A separate Converse call with no tools except its forced output schema, so an
 * image or bill that says "approve this" has nothing to hijack. It gets today's
 * date, the message date, and each known helper's service keys (Doc 3 §10 C3).
 * The output is validated once, here, against the domain extraction schema; a
 * schema-invalid answer gets EXTRACTION_REPAIR_ATTEMPTS retries with the issues
 * sent back, then fails loudly. Downstream code trusts the result.
 *
 * Extraction names helpers by name (it has no ids, C15); the result maps each
 * name to a helperId where exactly one helper has that name.
 *
 * Call site: the tool registry (extract_from_document).
 */
import { helperServices } from "@helper-assistant/core";
import { DocumentStorage, ExtractionKind, ImageMediaTypeSchema, ModelCallPurpose, ModelRole, PdfMediaTypeSchema, TERM_SOURCE_DOCUMENT_KINDS, ToolErrorCode } from "@helper-assistant/domain";
import type {
  AgreementExtraction,
  BillExtraction,
  ExtractionKind as ExtractionKindT,
  Helper,
  ModelContentBlock,
  ModelMessage,
  ModelRequest,
  SourceDocument,
} from "@helper-assistant/domain";
import { z } from "zod";
import { EXTRACTION_MAX_TOKENS, EXTRACTION_REPAIR_ATTEMPTS, EXTRACTION_TEMPERATURE } from "../settings";
import { tracedConverse } from "../model/tracedModel";
import type { ToolContext, ToolHandlers } from "../tools/context";
import { requireDocument } from "../tools/documents";
import type { DocumentPurpose } from "../tools/documents";
import { ToolFailure } from "../tools/errors";
import { EXTRACTION_OUTPUT_TOOL } from "./outputTools";
import { DOCUMENT_END, DOCUMENT_START, extractionContext, extractionSystemPrompt } from "./prompt";
import type { KnownHelper } from "./prompt";

/** Which documents each extraction kind may read. A bill never defines terms (Doc 3 §3.5); any document may be read as a bill. */
const EXTRACTION_SOURCE: Record<ExtractionKindT, DocumentPurpose | null> = {
  [ExtractionKind.AGREEMENT]: {
    allowedKinds: TERM_SOURCE_DOCUMENT_KINDS,
    why: "a bill is the helper's claim and is never read as an agreement.",
    refuseIfRecordedAsBill: true,
  },
  [ExtractionKind.BILL]: null,
};

type Extraction = AgreementExtraction | BillExtraction;

/** helperId is null unless exactly one known helper has this name. */
export type HelperMatch = { name: string; helperId: string | null };

export const extractHandlers: Pick<ToolHandlers, "extract_from_document"> = {
  extract_from_document: async ({ docId, extractionKind }, ctx) => {
    const document = await requireDocument(ctx, docId, EXTRACTION_SOURCE[extractionKind]);
    const helpers = await ctx.deps.store.listHelpers();
    const extraction = await extractDocument(ctx, document, extractionKind, await knownHelpers(ctx, helpers));
    return {
      docId,
      documentKind: document.kind,
      messageDate: document.messageDate,
      extractionKind,
      extraction,
      helperMatches: matchHelpers(namesIn(extractionKind, extraction), helpers),
    };
  },
};

/** Each helper's services, agreed or proposed, so extraction reuses their keys (a bill can arrive with its rates). */
async function knownHelpers(ctx: ToolContext, helpers: Helper[]): Promise<KnownHelper[]> {
  const services = await helperServices(ctx.deps, null);
  return helpers.map((h) => ({
    name: h.name,
    role: h.role,
    services: services.filter((s) => s.helperId === h.helperId).map(({ serviceKey, serviceLabel }) => ({ serviceKey, serviceLabel })),
  }));
}

export async function extractDocument(ctx: ToolContext, document: SourceDocument, kind: ExtractionKindT, helpers: KnownHelper[]): Promise<Extraction> {
  const tool = EXTRACTION_OUTPUT_TOOL[kind];
  const context = extractionContext({ today: ctx.deps.clock.today(), messageDate: document.messageDate, documentKind: document.kind, knownHelpers: helpers });
  const messages: ModelMessage[] = [
    {
      role: ModelRole.USER,
      content: [{ type: "text", text: context }, { type: "text", text: DOCUMENT_START }, await documentBlock(ctx, document), { type: "text", text: DOCUMENT_END }],
    },
  ];

  for (let attempt = 0; ; attempt++) {
    const request: ModelRequest = {
      system: extractionSystemPrompt(kind),
      messages,
      tools: [tool.spec],
      toolChoice: { type: "tool", name: tool.spec.name },
      maxTokens: EXTRACTION_MAX_TOKENS,
      temperature: EXTRACTION_TEMPERATURE,
    };
    const response = await tracedConverse(ctx.deps, ModelCallPurpose.EXTRACTION, request, ctx.trace.modelCalls);
    const answer = response.message.content.find((b) => b.type === "toolUse" && b.name === tool.spec.name);
    if (answer === undefined || answer.type !== "toolUse") {
      throw new ToolFailure(ToolErrorCode.INTERNAL, `Extraction returned no ${tool.spec.name} output (stop reason ${response.stopReason}).`);
    }
    const parsed = tool.schema.safeParse(answer.input);
    if (parsed.success) return parsed.data as Extraction;
    if (attempt >= EXTRACTION_REPAIR_ATTEMPTS) {
      throw new ToolFailure(ToolErrorCode.INTERNAL, `Extraction output didn't match the schema: ${z.prettifyError(parsed.error)}`);
    }
    messages.push(response.message, {
      role: ModelRole.USER,
      content: [
        {
          type: "toolResult",
          toolUseId: answer.toolUseId,
          status: "error",
          content: [{ type: "text", text: `Invalid against the schema. Fix these and call ${tool.spec.name} again:\n${z.prettifyError(parsed.error)}` }],
        },
      ],
    });
  }
}

async function documentBlock(ctx: ToolContext, document: SourceDocument): Promise<ModelContentBlock> {
  if (document.content.storage === DocumentStorage.INLINE_TEXT) return { type: "text", text: document.content.text };
  const blob = await ctx.deps.blobStore.get(document.content.blobKey);
  if (blob === null) throw new ToolFailure(ToolErrorCode.INTERNAL, `The file for document ${document.docId} is missing from storage.`);
  const { mediaType, bytes } = blob;
  if (PdfMediaTypeSchema.safeParse(mediaType).success) {
    // Converse names must be letters, digits, spaces and hyphens; docIds are UUIDs or slugs.
    return { type: "document", mediaType: "application/pdf", bytes, name: `document ${document.docId.replace(/[^A-Za-z0-9 -]/g, "-")}` };
  }
  return { type: "image", mediaType: ImageMediaTypeSchema.parse(mediaType), bytes };
}

const NAMES_BY_KIND: Record<ExtractionKindT, (extraction: Extraction) => (string | null)[]> = {
  [ExtractionKind.AGREEMENT]: (e) => {
    const a = e as AgreementExtraction;
    return [...a.helpers.map((h) => h.name), ...a.terms.map((t) => t.helperName), ...a.unencoded.map((u) => u.helperName)];
  },
  [ExtractionKind.BILL]: (e) => [(e as BillExtraction).helperName],
};

function namesIn(kind: ExtractionKindT, extraction: Extraction): string[] {
  return [...new Set(NAMES_BY_KIND[kind](extraction).filter((n): n is string => n !== null))];
}

const normalizeName = (name: string) => name.trim().toLowerCase();

export function matchHelpers(names: string[], helpers: readonly Helper[]): HelperMatch[] {
  return names.map((name) => {
    const matches = helpers.filter((h) => normalizeName(h.name) === normalizeName(name));
    return { name, helperId: matches.length === 1 ? matches[0]!.helperId : null };
  });
}
