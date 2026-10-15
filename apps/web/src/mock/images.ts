/**
 * The starter-pack screenshots, inlined by Vite so GET /api/documents/:id can
 * return real image bytes for "source beside extraction". The fixtures package
 * only exports typed data, so the raw files are read by path.
 */
import { docIds } from "@helper-assistant/fixtures";
import type { Id } from "@helper-assistant/domain";
import priyaRates from "../../../../fixtures/starter-pack/02-priya-rates.png?inline";
import lupeRates from "../../../../fixtures/starter-pack/03-lupe-rates.png?inline";
import theoRates from "../../../../fixtures/starter-pack/05-theo-rates.png?inline";
import lupeBill from "../../../../fixtures/starter-pack/07-lupe-september-bill.png?inline";

/** "data:image/png;base64,AAAA" → "AAAA". */
const base64Of = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(",") + 1);

export const STARTER_PACK_IMAGE_BASE64: ReadonlyMap<Id, string> = new Map([
  [docIds.priyaRates, base64Of(priyaRates)],
  [docIds.lupeRates, base64Of(lupeRates)],
  [docIds.theoRates, base64Of(theoRates)],
  [docIds.lupeBill, base64Of(lupeBill)],
]);
