/**
 * The eight starter-pack files as SourceDocuments, as if Jordan uploaded them on
 * Oct 14 without entering message dates. Text content is duplicated inline so
 * this module stays browser-safe for the web mock; a node test checks it against
 * the files in fixtures/starter-pack/.
 */
import { DocumentKind, DocumentStorage } from "@helper-assistant/domain";
import type { SourceDocument } from "@helper-assistant/domain";

export const STARTER_PACK_UPLOADED_AT = "2026-10-14T16:00:00.000Z";

export const docIds = {
  householdNotes: "doc-01-household-notes",
  priyaRates: "doc-02-priya-rates",
  lupeRates: "doc-03-lupe-rates",
  lupeRateChange: "doc-04-lupe-rate-change",
  theoRates: "doc-05-theo-rates",
  priyaBill: "doc-06-priya-september-bill",
  lupeBill: "doc-07-lupe-september-bill",
  theoBill: "doc-08-theo-september-bill",
} as const;

/** File name in fixtures/starter-pack/ for each document. */
export const starterPackFileByDocId: Record<string, string> = {
  [docIds.householdNotes]: "01-household-notes.txt",
  [docIds.priyaRates]: "02-priya-rates.png",
  [docIds.lupeRates]: "03-lupe-rates.png",
  [docIds.lupeRateChange]: "04-lupe-rate-change.txt",
  [docIds.theoRates]: "05-theo-rates.png",
  [docIds.priyaBill]: "06-priya-september-bill.txt",
  [docIds.lupeBill]: "07-lupe-september-bill.png",
  [docIds.theoBill]: "08-theo-september-bill.txt",
};

const text = (docId: string, kind: DocumentKind, body: string): SourceDocument => ({
  docId,
  kind,
  content: { storage: DocumentStorage.INLINE_TEXT, text: body },
  fileName: starterPackFileByDocId[docId]!,
  messageDate: null,
  receivedAt: STARTER_PACK_UPLOADED_AT,
  sessionId: null,
});

const image = (docId: string, kind: DocumentKind): SourceDocument => ({
  docId,
  kind,
  content: { storage: DocumentStorage.BLOB, blobKey: `starter-pack/${starterPackFileByDocId[docId]}`, mediaType: "image/png" },
  fileName: starterPackFileByDocId[docId]!,
  messageDate: null,
  receivedAt: STARTER_PACK_UPLOADED_AT,
  sessionId: null,
});

export const starterPackDocuments: SourceDocument[] = [
  text(
    docIds.householdNotes,
    DocumentKind.TYPED_NOTES,
    `Quick rundown of our helpers (typed by Jordan)

I'm Jordan, my partner is Sam. Kids: Maya (7) and Leo (4). Dog: Biscuit.

- Priya: babysitter. College student, usually after school on Wednesdays plus some
  weekend nights. Kids are in bed by 8.
- Lupe: cleaner, comes Tuesday mornings. Has a key.
- Theo: walks Biscuit on weekdays around noon. $25 a walk, sometimes he does a long one.

We pay everyone at the start of the month for the previous month.
Priya and Theo by Venmo, Lupe by Zelle.
`,
  ),
  image(docIds.priyaRates, DocumentKind.THREAD_SCREENSHOT),
  image(docIds.lupeRates, DocumentKind.THREAD_SCREENSHOT),
  text(
    docIds.lupeRateChange,
    DocumentKind.PASTED_THREAD,
    `[Copied from Jordan's phone, thread with Lupe]

Lupe (Fri Aug 28, 9:12 AM): Hi Jordan! Just a heads up, starting the 15th my regular visit will be $150. Deep clean stays the same 🙂 Thank you for understanding!
Jordan (Fri Aug 28, 9:40 AM): Of course, sounds good!
Lupe (Fri Aug 28, 9:41 AM): Also can I do the deep clean on the 22nd instead of regular?
Jordan (Fri Aug 28, 9:43 AM): Yes please
`,
  ),
  image(docIds.theoRates, DocumentKind.THREAD_SCREENSHOT),
  text(
    docIds.priyaBill,
    DocumentKind.BILL_TEXT,
    `[Copied from Jordan's phone, text from Priya, Thu Oct 1]

Hi Jordan! Here's September :)

Fri 9/4 date night 6–11:30pm — $114
Wed 9/9 after school 3–7pm — $88
Sat 9/12 7pm–12am — $122
Sun 9/20 10am–2pm — $132
   + last minute fee $40 (Sam said that was fine since it was same-day!)
Fri 9/25 date night 6–11pm — $100

Total: $626
Venmo is great, thank you!!
`,
  ),
  image(docIds.lupeBill, DocumentKind.BILL_SCREENSHOT),
  text(
    docIds.theoBill,
    DocumentKind.BILL_TEXT,
    `From: Theo
To: Jordan
Date: Thu, Oct 1
Subject: September walks: Biscuit

Hi Jordan,

September summary:
  30-min walks: 18 x $28 = $504
  60-min walks:  2 x $38 =  $76
  Total: $580

No walk on Labor Day (9/7).

Thanks!
Theo
`,
  ),
];
