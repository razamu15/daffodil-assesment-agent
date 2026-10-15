/**
 * Extraction goldens (build-plan §6.1 "Extraction": starter pack → expected
 * fields, live model, run 3×). The expectations are derived from the fixtures,
 * not written twice: a bill document must reproduce its fixture bill's lines
 * and totals, and an agreement document must yield every fixture term sourced
 * from it (rules and start date) and the fixture helpers' key access and payment
 * method. Wording, labels and assumption text are not compared.
 *
 * Call site: scripts/scenarios.ts.
 */
import { ExtractionKind } from "@helper-assistant/domain";
import type { AgreementExtraction, BillExtraction, Helper, PricingRule, SourceDocument, ToolResult } from "@helper-assistant/domain";
import { docIds, starterPackBills, starterPackHelpers, starterPackTerms } from "@helper-assistant/fixtures";
import { dispatchTool, emptyTrace } from "../../src/index";
import type { AgentDeps } from "../../src/index";

export type GoldenResult = { docId: string; run: number; problems: string[]; tokens: number };

export const BILL_DOC_IDS: readonly string[] = [docIds.priyaBill, docIds.lupeBill, docIds.theoBill];

const helperName = (helperId: string) => starterPackHelpers.find((h) => h.helperId === helperId)!.name;

/** A rule's identity for comparison: everything but the DAY_MULTIPLIER scope (an assumption, not the text). */
const withoutScope = ({ appliesTo: _scope, ...rest }: PricingRule & { appliesTo?: unknown }) => rest;

function ruleSignature(rule: PricingRule): string {
  return JSON.stringify(Object.fromEntries(Object.entries(withoutScope(rule)).sort(([a], [b]) => a.localeCompare(b))));
}

const sortedJson = (values: unknown[]) => JSON.stringify(values.map((v) => JSON.stringify(v)).sort());

function billProblems(docId: string, extraction: BillExtraction): string[] {
  const expected = starterPackBills.find((b) => b.sourceDocId === docId)!;
  const problems: string[] = [];
  const check = (what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  check("helperName", extraction.helperName, helperName(expected.helperId));
  check("statedTotalCents", extraction.statedTotalCents, expected.statedTotalCents);
  check("period", [extraction.periodStart, extraction.periodEnd], [expected.period.start, expected.period.end]);
  check("line amounts", sortedJson(extraction.lineItems.map((l) => l.amountBilledCents)), sortedJson(expected.lineItems.map((l) => l.amountBilledCents)));
  check("line kinds", sortedJson(extraction.lineItems.map((l) => l.lineKind)), sortedJson(expected.lineItems.map((l) => l.lineKind)));
  check("service keys", sortedJson(extraction.lineItems.map((l) => l.serviceKey)), sortedJson(expected.lineItems.map((l) => l.serviceKey)));
  check(
    "times",
    sortedJson(extraction.lineItems.map((l) => [l.startAt, l.endAt])),
    sortedJson(expected.lineItems.map((l) => [l.startAt, l.endAt])),
  );
  check("authorization claims", extraction.lineItems.filter((l) => l.authorizationClaim !== null).length, expected.lineItems.filter((l) => l.authorizationClaim !== null).length);
  return problems;
}

function agreementProblems(docId: string, extraction: AgreementExtraction, helpers: readonly Helper[]): string[] {
  const problems: string[] = [];
  for (const term of starterPackTerms.filter((t) => t.sourceDocId === docId)) {
    const name = helperName(term.helperId);
    const want = sortedJson(term.pricingRules.map(ruleSignature));
    const found = extraction.terms.find((t) => t.helperName.toLowerCase() === name.toLowerCase() && sortedJson(t.pricingRules.map(ruleSignature)) === want);
    if (found === undefined) problems.push(`no ${name} term with rules ${term.pricingRules.map(ruleSignature).join(" + ")}`);
    else if (found.effectiveFrom !== term.effectiveFrom) problems.push(`${name} ${term.serviceLabel}: effectiveFrom ${found.effectiveFrom}, want ${term.effectiveFrom}`);
  }
  if (docId === docIds.householdNotes) {
    for (const helper of helpers) {
      const got = extraction.helpers.find((h) => h.name.toLowerCase() === helper.name.toLowerCase());
      if (got === undefined) problems.push(`helper ${helper.name} missing`);
      else {
        if (got.houseKeyAccess !== helper.houseKeyAccess) problems.push(`${helper.name} houseKeyAccess ${got.houseKeyAccess}, want ${helper.houseKeyAccess}`);
        if (got.payment.method !== helper.payment.method) problems.push(`${helper.name} payment ${got.payment.method}, want ${helper.payment.method}`);
      }
    }
  }
  return problems;
}

/** Runs every starter-pack document through extract_from_document `runs` times. */
export async function runExtractionGoldens(deps: AgentDeps, documents: readonly SourceDocument[], runs: number): Promise<GoldenResult[]> {
  const results: GoldenResult[] = [];
  for (const document of documents) {
    const kind = BILL_DOC_IDS.includes(document.docId) ? ExtractionKind.BILL : ExtractionKind.AGREEMENT;
    for (let run = 1; run <= runs; run++) {
      const trace = emptyTrace();
      const ctx = { deps, sessionId: "scenario-goldens", turnId: `golden-${document.docId}-${run}`, statement: null, trace };
      const result = (await dispatchTool("extract_from_document", { docId: document.docId, extractionKind: kind }, ctx)) as ToolResult<{
        extraction: AgreementExtraction | BillExtraction;
      }>;
      const tokens = trace.modelCalls.reduce((n, c) => n + c.inputTokens + c.outputTokens, 0);
      if (!result.ok) {
        results.push({ docId: document.docId, run, problems: [`${result.error.code}: ${result.error.message}`], tokens });
        continue;
      }
      const problems =
        kind === ExtractionKind.BILL
          ? billProblems(document.docId, result.data.extraction as BillExtraction)
          : agreementProblems(document.docId, result.data.extraction as AgreementExtraction, starterPackHelpers);
      results.push({ docId: document.docId, run, problems, tokens });
    }
  }
  return results;
}
