import { describe, expect, it } from "vitest";
import {
  AgreementTermSchema,
  BillSchema,
  DocumentStorage,
  HelperSchema,
  HouseholdSchema,
  SourceDocumentSchema,
} from "@helper-assistant/domain";
import {
  expectedBillChecks,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "../src/index";
import { readStarterPackFile } from "../src/node";

describe("starter-pack fixtures conform to the domain contract", () => {
  it("household, helpers, documents, terms and bills parse", () => {
    HouseholdSchema.parse(starterPackHousehold);
    starterPackHelpers.forEach((h) => HelperSchema.parse(h));
    starterPackDocuments.forEach((d) => SourceDocumentSchema.parse(d));
    starterPackTerms.forEach((t) => AgreementTermSchema.parse(t));
    starterPackBills.forEach((b) => BillSchema.parse(b));
  });

  it("inline document text matches the files on disk", async () => {
    for (const doc of starterPackDocuments) {
      if (doc.content.storage !== DocumentStorage.INLINE_TEXT) continue;
      const onDisk = new TextDecoder().decode(await readStarterPackFile(doc.docId));
      expect(doc.content.text, doc.docId).toBe(onDisk);
    }
  });

  it("bill line amounts add up to the answer key's sumOfLines", () => {
    for (const expected of expectedBillChecks) {
      const bill = starterPackBills.find((b) => b.billId === expected.billId)!;
      const sum = bill.lineItems.reduce((acc, l) => acc + l.amountBilledCents, 0);
      expect(sum, bill.billId).toBe(expected.sumOfLinesCents);
      expect(bill.statedTotalCents).toBe(expected.statedTotalCents);
      expect(bill.lineItems.map((l) => l.lineId)).toEqual(expected.lines.map((l) => l.lineId));
    }
  });

  it("every term and bill points at a starter-pack document", () => {
    const docIdSet = new Set(starterPackDocuments.map((d) => d.docId));
    [...starterPackTerms, ...starterPackBills].forEach((r) => expect(docIdSet.has(r.sourceDocId)).toBe(true));
  });
});
