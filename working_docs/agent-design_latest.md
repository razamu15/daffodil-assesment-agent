# Agent Design & Code

Written for: Saad. Doc 3 of 4. Synced with the Track 0 contract (§10). Covers the agent, the data model, the checker, and the code shape. "§" in `cheatsheet` refers to `agents-cheatsheet_latest.md`.

Items marked **[DECIDE]** need your call.

---

## 1. The core split: model vs code

Remember the rule (cheatsheet §6.2): **model understands, code decides.**

| Job | Owner |
|---|---|
| Read messy text and screenshots | Model (quarantined extraction call) |
| Turn them into structured data | Model, forced to a JSON schema |
| Compare, calculate, enforce, commit | **Code** |
| Explain results in plain words | Model |
| Say yes | Jordan, through a UI button |

```
Messy input ─► [MODEL: extract] ─► structured draft ─► Jordan confirms ─► [CODE: save]
Bill ─► [MODEL: extract] ─► [CODE: checkBill] ─► verdict ─► [MODEL: explain] ─► Jordan
```

---

## 2. Domain model

### 2.1 The map

```
Household ──< Helper ──< AgreementTerm >── SourceDocument
                │                               ▲
                ├──< Bill ──< LineItem ─────────┘ (bill source)
                │      └── Approval (sealed inside the bill)
                │
                ├──< OutboundMessage   (drafted, handed off)
                └──< HelperNote        (things we couldn't encode)

PendingAction ──► points at a Helper, Bill, Term or Message (the gate for all changes)
Session ──< (messages live in AgentCore)   Turn = trace of one agent run

BillingPeriodStatus = DERIVED (not stored)
```

### 2.2 Six modeling strategies, and what we picked

These are the big choices. Each entity below applies one of them.

| # | Question | Options | **Picked** | Why |
|---|---|---|---|---|
| **S1** | How do we store things that change? | (a) Overwrite the row (b) Event log only (c) **Versioned rows with effective dates** | **(c)** | (a) loses history: Sep 1 would be checked against the *new* rate, which is exactly Lupe's case. (b) is great for audit but hard to read: you replay to see "now". (c) gives readable current state *and* full history |
| **S2** | One table per thing, or embed? | (a) Normalize, join at read (b) **Embed children in the parent** | **Mixed** | Embed what never lives alone (LineItems in a Bill). Separate what's queried alone (Terms by helper and date) |
| **S3** | Fixed fields or flexible blob? | (a) Typed fields only (b) Free JSON (c) **Typed core + a notes escape hatch** | **(c)** | (a) breaks on the first unexpected term. (b) can't be checked by code. (c) checks what we understand and stores the rest honestly (cheatsheet §8.4) |
| **S4** | How do we represent "don't know"? | (a) A default (`false`, `0`) (b) `null` (c) **Explicit enum value `UNKNOWN`** | **(c)** for domain facts | A default is a lie that looks real. `null` is easy to misread as "no". `UNKNOWN` is self-describing |
| **S5** | Store a fact or derive it? | (a) Store status everywhere (b) **Derive it when you can** | **(b)** | Stored status drifts. Month status is computed from bills + helpers + policy on read, and needs no scheduler |
| **S6** | At approval, point or snapshot? | (a) Point at current records (b) **Freeze a copy** | **(b)** | A later rate change must never rewrite what Jordan approved |

### 2.3 Entities, with jot notes

Format: **fields** → *why this shape* → *what we passed on*.

#### Household
```
householdId,
billingPolicy { cadence: MONTHLY_IN_ARREARS, expectedByDayOfMonth: number | null }
```
- *Why:* "We pay at the start of the month for the previous month" is a household rule, not a helper rule. One user: whoever logs in decides. There is no list of people in the household.
- *Passed on:* hardcoding the rhythm as constants. It hides a domain rule. Only one row exists today, but it's cheap to model.
- `expectedByDayOfMonth` is `null` until Jordan says. We don't invent a due date (S4).

#### Helper
```
helperId, name, role (free text: "babysitter", "tutor"),
status: ACTIVE | ENDED, startedOn?, endedOn?,
houseKeyAccess: HAS_KEY | NO_KEY | UNKNOWN,
payment { method: VENMO | ZELLE | UNKNOWN, handle? },
contact { channel: SMS | EMAIL | UNKNOWN, handle? },
notes, version
```
- *Why `houseKeyAccess` is a 3-value enum:* the notes only say Lupe has a key. For Priya and Theo we don't know, so `UNKNOWN`, **not** `NO_KEY` (S4). It also drives behavior: when Jordan ends Lupe's engagement, the assistant reminds *"Lupe has a key."*
- *Why `role` is free text:* no logic depends on it, and unseen helper types (a tutor) must be recordable without a code change.
- *Profile edits are not gated.* The agent saves them with `save_helper`; the UI edits them directly. Only terms, approvals, messages and engagement ends need confirmation.
- *Why `status` and `endedOn`:* mid-month settlement (Product §4.7). A helper is never deleted; they end.
- *Why payment and contact live here:* they're facts about the person, not about a deal.
- *Passed on:* a free-form `attributes` map. It can't drive any behavior, and typos become new fields.
- `version` is for optimistic concurrency (cheatsheet §7.3).

#### SourceDocument
```
docId, kind: TYPED_NOTES | THREAD_SCREENSHOT | PASTED_THREAD | BILL_TEXT | BILL_SCREENSHOT | AGREEMENT_PDF | BILL_PDF,
content (S3 key + image or PDF media type, or text), messageDate?, receivedAt, sessionId, messageId
```
- *Why separate:* one thread often yields several terms (Lupe's thread gives regular, deep clean, and the later change). Terms point at the document instead of copying it.
- *Why `messageDate`:* "starting the 15th" can only be resolved against the date of the message.
- *Passed on:* a `source` string on each fact. It duplicates, can't show the original, and can't be reused.
- Immutable. Never edited.
- *`fileName` (2026-10-16):* what Jordan's file was called, or null for pasted text and chat statements. It names the attachment in chat (and the chat itself when the first message is only files), and the model sees it too ("07-lupe-september-bill.png" is a useful hint).
- *Formats (2026-10-16):* images and PDFs are stored as blobs (PDFs reach the model as a document block); any text file is stored as text. The UI suggests a kind from the file's format and name, and Jordan can change it before sending. Other formats are refused with a reason.

#### AgreementTerm
```
termId, helperId, serviceKey, serviceLabel, pricingRules[], schedule,
effectiveFrom, effectiveTo | null,
sourceDocId, sourceQuote, assumptions[],
supersedesTermId | null, createdByActionRef
```
- *Why versioned rows (S1):* a rate change **closes** the old row and **adds** a new one. Bills are checked against the term in effect *on each line's date*.
- *The earliest version covers the past (decided 2026-10-16):* a first rate's `effectiveFrom` is usually just the day it was written down, so the checker treats the earliest version of each service as also covering every date before it. Without this, opening the app on the 15th and saving a rate would make the first half of the month look uncovered. Only the earliest version reaches back; later versions start on their own date.
  - *Passed on:* an explicit "open start" value on `effectiveFrom` (most precise, much larger change), and a `startBasis` flag (keeps a date that means "when we learned it").
  - *Known edge:* a first rate whose start *was* stated ("we start Sept 1") also covers earlier dates. Acceptable: bills before a helper started are rare, and Jordan sees the bill anyway.
- *A bill line's serviceKey must be one of the helper's existing keys, or null (2026-10-16).* record_bill refuses an invented key and names the real ones. Seen in testing: "after school" was saved as a new key `after-school`, so Priya's ordinary hourly line was reported as "no agreement". A line described by when or why it happened is the helper's regular hourly service.
- *Rates named instead of stated ("my late rate"):* extraction encodes them from the same document when it states the rate; the agent resolves them across documents and saved terms. When a check fails on a missing rate the helper's sources do state, the agent proposes adding it (Jordan confirms; the bill re-checks).
- *ADD_EARLIER_TERM:* when Jordan later learns an older rate, one confirmed change adds it (with its `effectiveTo`) and moves the earliest saved version's `effectiveFrom` to the day after. That's the only change besides closing that edits an existing row (version bumped).
- *Why `serviceKey` (a per-helper slug like `date-night`), not a global enum:* new helper types bring new services. The key only has to match between a term and a bill line. Extraction is given the helper's existing keys so it reuses them.
- *Why one term per `serviceKey`:* Lupe's regular visit changed and her deep clean didn't. They move independently.
- *Why `sourceQuote` and `assumptions[]`:* every number can show its "why". "Assumed Sep 15" is data, not a hidden guess.
- *Passed on:* one overwritten "rate card" per helper (S1a), and a term-per-helper-type table.
- Future-dated rows are legal (the vacation case).

#### PricingRule (inside AgreementTerm)
```
FLAT_PER_UNIT   { unit: VISIT | WALK, amount }
HOURLY          { amount }
HOURLY_AFTER    { afterTime, amount }
DAY_MULTIPLIER  { dayOfWeek, multiplier }
FLAT_BLOCK      { amount, untilTime }          // overage uses HOURLY_AFTER / late rate
FEE             { label, amount, condition? }
```
- *Why a tagged union:* one checker engine evaluates all kinds. Helpers differ only in **data** (one engine, many rule rows).
- *Passed on:* a column per rate type (sparse, breaks on the next new rule), and a coded function per helper (hardcodes people).
- A term that doesn't fit any kind goes to `HelperNote` (S3), never forced into the nearest rule.

#### ServiceSchedule (inside AgreementTerm)
```
kind: WEEKLY_ON | WEEKDAYS | AD_HOC | UNSPECIFIED,  days?
```
- *Why:* feeds the plausibility notes (Product §6, option B).
- *Why `AD_HOC` vs `UNSPECIFIED`:* "no fixed schedule" and "we don't know" are different facts (S4).

#### Bill
```
billId, helperId,
period { start, end, kind: CALENDAR_MONTH | CUSTOM_RANGE | FINAL_SETTLEMENT },
lineItems[], statedTotal,
sourceDocId, status: RECEIVED | SUPERSEDED | APPROVED,
supersedesBillId | null, extractionAssumptions[],
latestCheck, approval?, version
```
- *Why a period range with a `kind`:* a `"2026-09"` string can't express "Oct 1 to 14" for a final settlement. One shape, three kinds (code path unified, distinction kept).
- *Why `statedTotal` is stored but never trusted:* it's what the helper wrote. We compare it with the sum of lines. Priya's $626 vs $596 is exactly this.
- *Why LineItems are embedded (S2):* they don't exist outside a bill, and the approval snapshot wants them together.
- *Why `SUPERSEDED`:* after "ask the helper," a corrected bill arrives. We keep the old one for the record.
- *Status with discrepancies:* stays `RECEIVED`. "Flagged" is the verdict on `latestCheck`, shown as `CHECKED_FLAGGED` in month status. It leaves `RECEIVED` only by approval (→ `APPROVED`) or a corrected bill (→ `SUPERSEDED`).
- *Passed on:* an `Invoice` model.

#### LineItem (embedded in Bill)
```
lineId, serviceKey, label,
startAt?, endAt?        // household-local datetimes, no timezone
quantity?, unit?,
amountBilled,
lineKind: SERVICE | FEE | ADJUSTMENT,
authorizationClaim? { claimedApprover, text }
```
- *Why `startAt` / `endAt` as full datetimes:* "7pm to 12am" crosses midnight. A full datetime makes that explicit instead of a hidden `+1 day` rule.
- *Why a fee is a line with `lineKind: FEE`:* it's checked and totaled like everything else. It's just usually `NOT_COVERED`.
- *Why `authorizationClaim`:* "Sam said that was fine" is a **claim by the helper about a third party**. We store it as a claim. It never counts as an agreement unless Jordan accepts it.
- *Passed on:* a bill-level "extras" field. It splits the totals logic into two.

#### Approval (sealed inside Bill)
```
approvedAt, approvedBy: USER_UI, viaActionRef,
billedAmount, amountApproved,
acceptedExceptions[{ lineId | flagKind, reason }],
checkSnapshot, termVersionIds[]
```
- *Why a snapshot (S6):* what Jordan saw is what's recorded, even if terms change next year.
- *Why it's inside the Bill:* one conditional write flips `RECEIVED → APPROVED` and writes the approval together. After that, no update path exists.
- *Passed on:* mutable "approved" flags.

#### PaymentRecord
```
paymentId, billId, helperId, amountCents, paidOn, method, note, recordedAt
```
- *Why:* Jordan pays outside the app, then clicks "Mark as paid". This records that statement. It moves no money.
- *Why separate from the Bill:* the approved bill is sealed. Paid is a new fact, not an edit.
- *Not gated:* the click is Jordan's own statement. One per bill.

#### PendingAction
```
ref (short int), type: AGREEMENT_CHANGE | BILL_APPROVAL | HELPER_MESSAGE | HELPER_ENGAGEMENT_END,
targetKey, payload (snapshot), basedOn (ActionBasis union, see §10),
status: PENDING | CONFIRMED | REJECTED | WITHDRAWN | SUPERSEDED | STALE | EXPIRED,
supersededByRef?, createdAt, resolvedAt, resolvedBy: USER_UI | SYSTEM,
sourceSessionId, sourceMessageId, sourceDocId?, assumptions[]
```
- *Why one entity for every gated change:* confirm logic, audit trail, and conflict handling are written **once**. This is the "shared behavior behind one abstraction" rule.
- *Why the `type` enum:* behavior differs per type (what "confirm" does), but the pipeline is shared.
- *Passed on:* a separate "draft" model per feature. That's four copies of confirm and conflict logic that would drift.
- *Why short `ref`:* the model copies `#7` more reliably than a UUID (cheatsheet §7.3).

#### OutboundMessage
```
messageId, helperId, reason: DISCREPANCY | MISSING_BILL | FINAL_SETTLEMENT | OTHER,
relatedBillId?, relatedPeriod?, body,
deliveryMode: MANUAL_HANDOFF,
status: DRAFT | READY | HANDED_OFF | DISCARDED,
channelHint, createdByActionRef
```
- *Why `deliveryMode` as data:* today it's always `MANUAL_HANDOFF` (copy / open in Messages). Real sending later is a new mode, not a rewrite.
- *Why `HANDED_OFF` and not `SENT`:* we can't know it was sent. Honest status names.
- *Passed on:* storing drafts only in the chat. The record of "we asked Priya on Oct 14" is useful later.

#### HelperNote (the escape hatch)
```
noteId, helperId?, text, sourceDocId, status: OPEN | RESOLVED
```
- *Why:* S3. When a term can't be encoded, we store it honestly. Bills touching it get `CANNOT_COMPUTE`.
- *Also a signal:* a pile of similar notes tells us which rule kind to add next.

#### Session and Turn
```
Session { sessionId, title, createdAt, activeTurnId | null }
Turn    { turnId, sessionId, status, toolCalls[], modelCalls[], tokens, error, startedAt, finishedAt }
```
- *Why messages aren't here:* chat history lives in AgentCore short-term events. Two copies would drift.
- *Why `Turn` is separate:* runs aren't reproducible, so the trace is the record (cheatsheet §9.2). Keeping it out of chat history keeps the history clean.
- `activeTurnId` is the per-session lock (cheatsheet §4.2).

#### BillingPeriodStatus (derived, not stored)
```
for each ACTIVE (or just-ended) helper × period:
  NOT_RECEIVED | RECEIVED | CHECKED_OK | CHECKED_NEEDS_INFO | CHECKED_FLAGGED | APPROVED | PAID
  + "asked helper on <date>" if an OutboundMessage exists
```
- *Why derived (S5):* it comes from bills, helpers, policy and messages. With no scheduler, nothing would keep a stored copy fresh.

### 2.4 Shared enums (one home: `packages/domain`)

```
HelperRole, HelperStatus, HouseKeyAccess, PaymentMethod, ContactChannel,
PricingRuleKind, ScheduleKind, BillStatus, BillPeriodKind,
LineKind, LineStatus, BillVerdict, PendingActionType, PendingActionStatus,
MessageReason, MessageStatus, DocumentKind
```

Helper role and service are **not** enums: role is free text and services are per-helper `serviceKey` slugs. No logic branches on them, and unseen helper types must work without a code change.

---

## 3. The checker (pure code, no model)

The heart of correctness. `checkBill(bill, termsInEffect, household) → BillCheck`.

**Likely cause (2026-10-16).** When a line DIFFERS, the checker also prices it under the same service's other versions. If one charges exactly what was billed, the line carries `likelyCause: RATE_FROM_OTHER_PERIOD` (which version, later or earlier, its dates) and a plain-words explanation: "$150 is the newer rate, which only starts Sep 15. It looks like the new rate was used for work before the change." It's code, not the model, so the same bill always gets the same story; the review screen, Home and the agent all read it from the check.

### 3.1 Line status

| Status | Meaning | Example |
|---|---|---|
| `MATCHES` | Billed equals expected | Priya 9/9: 4h × $22 = $88 |
| `DIFFERS` | Computable, billed ≠ expected (delta and reason) | Lupe 9/1: $150 vs $140 |
| `NOT_COVERED` | No agreement covers it | Priya's $40 fee |
| `CANNOT_COMPUTE` | A term is ambiguous or inputs are missing | "late rate" undefined |
| `UNVERIFIABLE` | Unknowable by nature | A reimbursement line ("pizza $18"). Theo's walk *count* is a bill-level `QUANTITY_UNVERIFIABLE` INFO finding; his lines are `MATCHES` |

**Never collapse "unknown" into "matches."**

### 3.2 Bill-level checks

- Stated total vs sum of lines.
- Lines whose date falls outside the period.
- Duplicate date and service.
- Service with no agreement at all.
- Period already approved (a corrected bill arrives too late) → `PERIOD_ALREADY_APPROVED`.
- **Plausibility notes** (informational only): billed dates vs `schedule`, billed count vs expected count.

### 3.3 Verdict derivation (explicit table)

| Condition | Verdict |
|---|---|
| Any `DIFFERS`, `NOT_COVERED`, or total mismatch | `DISCREPANCIES` |
| Else any `CANNOT_COMPUTE` | `NEEDS_INFO` |
| Else | `CHECKS_OUT` (plus any `UNVERIFIABLE` or plausibility notes) |

### 3.4 Worked example: Priya 9/4

```
Fri 9/4  6:00pm–11:30pm  "date night"   billed $114

Term:  FLAT_BLOCK $100 until 11:00pm, overage at HOURLY_AFTER $28/hr
Calc:  $100 + 30 min × $28/hr = $114
Result: MATCHES    assumption: "late rate" = $28/hr
```

### 3.5 Source precedence (when inputs disagree)

| Rank | Source | Reliability |
|---|---|---|
| 1 | Direct dated message from the helper (screenshot or thread) | High |
| 2 | Pasted copy of a thread | High, but copy may be partial |
| 3 | Jordan's typed notes (from memory, undated) | Lower |
| 4 | **A bill** | Not an agreement. It's a claim |

Rules:
- Newer beats older for the same helper and service.
- Direct beats notes (Theo: $28 text beats $25 notes).
- **A bill never defines terms.** If it charges $28 and no term says $28, the line is `NOT_COVERED` or `DIFFERS`.
- The assistant proposes. It shows both sides. **Jordan decides.**

---

## 4. The agent harness

Hand-rolled loop on the Bedrock Converse API (decided).

### 4.1 One turn

```
POST /api/chat {sessionId, text, attachments[]}
   │  take session lock (reject if a turn is running)
   ▼
Agent run:
   1. Load history from AgentCore short-term events
   2. Retrieve long-term records → "background hints" block
   3. Inner loop: model ⇄ tools until the model returns text
   4. Write this turn's user + assistant events to AgentCore
   5. Save the Turn trace, release the lock
   │
UI polls GET /api/turns/:id → reply + any new pending cards
```

### 4.2 System prompt: what it says

- **Role:** helps Jordan track what was agreed and check bills.
- **Truth:** the database is truth. Memory is a hint. Never state a rate without a tool.
- **Honesty:** if you can't verify, say so. Never invent a value.
- **Power:** you can propose, not commit. Jordan confirms in the UI.
- **Conflicts:** if a tool reports conflicts, explain and ask. Never choose.
- **Limits:** you can't pay, send, or edit approved bills. If asked, say so plainly.

Guidance only. **Not** the safety layer (cheatsheet §7.1).

### 4.3 Tools

**Read (no side effects):**

| Tool | Returns |
|---|---|
| `list_helpers` | Helpers, roles, status, key access |
| `list_agreements(helper, asOf?)` | Terms in effect, with sources |
| `list_bills(status?, period?)` | Bills and statuses |
| `get_bill(billId)` | Lines and latest check |
| `check_bill(billId)` | Deterministic `BillCheck` (§3) |
| `get_month_status(period?)` | Derived status per helper |
| `list_pending_actions` | What's waiting on Jordan |
| `extract_from_document(docId, kind)` | Structured draft from the quarantined call (§4.4) |

**Record (writes data, but not money or terms):**

| Tool | Notes |
|---|---|
| `save_helper(helperId?, profile)` | Create or update a helper's profile. Not gated |
| `record_bill(extraction)` | Saves a `RECEIVED` bill **and runs `checkBill` on it**, so discrepancies are flagged on arrival. Supersedes an earlier unapproved bill for the same helper and period. Never touches an approved one |

**Propose (writes a `PENDING` row, nothing real changes):**

| Tool | Notes |
|---|---|
| `propose_agreement_change(...)` | Returns `needs_decision` with conflicts when the target key clashes |
| `propose_bill_approval(billId, acceptedExceptions[])` | Snapshots the current check and term versions. Also used after a discrepancy is settled outside the app ("talked to Priya, the bill is correct"): the flagged items become accepted exceptions with Jordan's reason |
| `propose_helper_message(helperId, reason, body)` | Draft. Jordan edits and confirms |
| `propose_engagement_end(helperId, endedOn)` | Settlement. Returns the key reminder if `HAS_KEY` |
| `withdraw_pending_action(ref)` | Safe: only reduces what could happen |

**Escape hatches (the honest exit):**

| Tool | Notes |
|---|---|
| `save_unstructured_note(helperId?, text)` | "Can't encode this yet" |
| `flag_for_review(reason)` | Surfaces a gap to Jordan |

**Tools the model does NOT get:**

```
confirm_action    approve_bill (direct)    send_message    edit_approved_bill
delete_anything   run_code
```

Confirm paths exist only behind the UI endpoint. **That absence is the safety.**

### 4.4 Extraction: the quarantined call

```
Upload / paste
   ▼
extract_from_document ──► separate Converse call
                          • NO tools
                          • output forced to a JSON schema (via a schema "tool" + toolChoice)
                          • includes sourceQuote, assumptions[]
   ▼
Structured draft ──► agent explains it ──► propose_* / record_bill ──► Jordan confirms
```

- **Why separate:** an image or bill saying "approve this" has no tools to hijack (cheatsheet §7.4).
- **Inputs it gets:** today's date and the message date, so it can resolve "the 15th" and missing years.
- **Missing stays missing:** `null`, never a default.
- **Assumptions are output:** e.g. `"effectiveFrom inferred as 2026-09-15 from 'the 15th' in a message dated Aug 28"`.
- **Output validated once**, at this boundary. Downstream code trusts it.

### 4.5 Memory: what goes where

| Memory | What goes in | How |
|---|---|---|
| **AgentCore short-term** | User and final assistant messages per session | Write events each turn. Rebuild `messages` at turn start |
| **AgentCore long-term** | Preferences, nicknames, usual hours, how Jordan likes things phrased | Preference + semantic strategies. Retrieve at turn start |
| **DynamoDB** | Terms, bills, actions, approvals, messages | Tools only |

Rules:
- Retrieved long-term facts go in as *"background hints, may be outdated, the database is truth."*
- **Money facts always come from tools**, never memory.
- History holds user text and final assistant text. Tool traces live in `Turn`. The DB is truth, so the agent can re-query.
- Long-term extraction is async, so nothing critical depends on it.

### 4.6 Confirmations and conflicts

Three layers (cheatsheet §7.3):

| Layer | Job | Who |
|---|---|---|
| Detect | On propose, find pending actions with the same `targetKey` | Code |
| Enforce | On confirm, re-read `basedOn`. Changed → `STALE` | Code |
| Explain | Tell Jordan, let them choose | Model |

```
PENDING ──► CONFIRMED | REJECTED | WITHDRAWN | SUPERSEDED | STALE | EXPIRED
```

**One gate for every entry point.** The chat path and the UI "Approve" button both go through the same function:

```
Chat:      agent calls propose_bill_approval ─┐
                                              ├─► PendingAction ─► confirm ─► applyAction()
Bill view: "Approve" button                  ─┘   (button = propose + confirm in one request)
```

`applyAction()` for `BILL_APPROVAL`:
1. Re-run `checkBill`. If it differs from the snapshot → `STALE`.
2. Conditional write: requires `status = RECEIVED` and the same `version`.
3. Write the sealed `Approval`.
4. After this, no code path edits the bill.

---

## 5. Product features → agent behavior

| Product feature (Doc 1) | Agent tools | Notes |
|---|---|---|
| Learn agreements | `extract_from_document` → `propose_agreement_change` | Conflicts and assumptions shown |
| "Have the bills come?" | `get_month_status` | Runs on app open and on request, not on a schedule |
| Check a bill | `record_bill` → `check_bill` | Verdict + line-by-line |
| Flag discrepancies | `check_bill` results | Model explains in plain words |
| Ask the helper | `propose_helper_message` | Draft. Jordan edits and confirms. Copy / SMS link |
| Approve for payment | `propose_bill_approval` or UI button | One gate |
| Settle mid-month | `propose_engagement_end` + `propose_helper_message` | Final bill expected for the partial period |
| Chat about records | read tools | Sourced answers |

### On-open month status (the "scheduler" replacement)

When Jordan opens the app, the UI calls `GET /api/month-status`. This is **plain code**, not a model call. The chat greeting can then say: *"September: 2 bills need attention, 1 is ready. Theo's October bill isn't here yet."* The assistant runs the model only when Jordan asks it something.

---

## 6. When things go wrong

| Situation | Behavior |
|---|---|
| Term can't be encoded | `HelperNote` + the bill line becomes `CANNOT_COMPUTE`. The assistant says so |
| Extraction is unsure | Field is `null` with an assumption. Never filled |
| Two sources disagree | Propose by precedence (§3.5), show both, Jordan decides |
| Two tabs conflict | `STALE`. "Lupe's terms changed. Re-review" |
| Corrected bill arrives for an approved period | Flagged `PERIOD_ALREADY_APPROVED`. Not applied |
| Bill contains instructions | Quarantined extraction has no tools. Ignored as data |
| Model claims something it can't do | Prompt lists limits. Tools list is the real boundary |
| Long turn | Async turn, polled. Progress text from the Turn trace |

---

## 7. Code layout and principles

Layout details are in Doc 4 §2. Principles from your standing rules:

| Principle | Where it shows up |
|---|---|
| Domain explicit in data | The enums in §2.4 |
| Shared behavior, distinct data | One `checkBill` engine. One `PendingAction` pipeline. One `applyAction` gate |
| Never turn unknown into "probably" | `UNKNOWN` enums, `null` + assumption, `CANNOT_COMPUTE` |
| Tables over branching | Rule kind → evaluator map. Status transition table. Verdict table |
| Naming carries meaning | `houseKeyAccess`, `authorizationClaim`, `HANDED_OFF` |
| Validate once at the boundary | API layer and extraction output. Core and tools assume valid input |
| Short files | ≤ 400 lines. Constants and enums in `packages/domain`, never in a sibling |
| Docstrings name call sites | Every shared function lists who calls it |
| Deferred problems are named | A "Future fixes" list in DESIGN.md |

---

## 8. Open decisions in this doc

| # | Decision | My recommendation |
|---|---|---|
| A1 | Keep "Approve anyway with exceptions" (Product P9) | **Decided: yes.** Quiet secondary action |
| A2 | Keep `ServiceSchedule` plausibility notes (Product P11, option B) | **Decided: yes.** Informational only |
| A3 | Corrected-bill supersede rule (Product P10) | **Decided: yes**, as described in §4.3 |
| A4 | `record_bill` needs no confirmation | **Decided: yes.** It runs the checker on save, so a bad bill is flagged anyway |

---

## 9. Auth options

You asked for simpler options. Here they are, simplest to most complex.

**The rule that matters:** protect the **data** at the API, not just the front door. The static UI is only a shell, but the API URL is reachable directly, so every `/api/*` call must check for a valid token.

| # | Option | How it works | Effort | Watch out for |
|---|---|---|---|---|
| **1** ✅ | **Password you choose at deploy time**, checked by the API | `APP_PASSWORD=... npm run deploy`. Login screen posts the password. API returns a signed token (HMAC with expiry). Every `/api/*` route checks it | Smallest. ~40 lines. No extra AWS resources | Password sits in a Lambda env var. Fine for a take-home. Deploy fails loudly if unset |
| 2 | Generated password in Secrets Manager | CDK generates a secret. README says run a CLI command to read it. Same login flow | Small | One more command for the reviewer. Slightly more infra |
| 3 | HTTP Basic Auth in a CloudFront Function | Browser's native prompt. No login screen | Small for UI | The API Gateway URL is reachable **directly**, bypassing CloudFront. You'd need an origin secret header check. Password baked into function code |
| 4 | Cognito user pool | The "standard" answer | Largest. User creation, temp passwords, hosted UI or SDK | More that can break on first deploy |
| 5 | IP allow-list (WAF) | Only your IPs | Small | Blocks the reviewers. No |
| 6 | API key header | Static key in the frontend bundle | Tiny | Anyone can read it from the page. Not real auth |

**Recommend option 1.** Reasons:

- Fewest moving parts, so the best odds of "deploys first try".
- Protects data even when the API URL is found directly.
- Fails loudly when `APP_PASSWORD` is missing: no insecure default.
- Upgrade path (Cognito) goes in DESIGN.md.

**Token details (keep simple):**
- `token = base64(expiry) + "." + HMAC(APP_PASSWORD, expiry)`. Stateless, no signing-key secret.
- Compare in constant time. Expire after e.g. 12 hours.
- Login route is the only unauthenticated API route.

---

## 10. Track 0 contract changes (source of truth: `packages/domain`)

Track 0 turned §2 to §4 into zod schemas. Where the doc was ambiguous or missed a case, the code decided. The changes:

| # | Change | Why |
|---|---|---|
| C1 | `AgreementTerm.pricingRules[]` (was one `pricingRule`). A term's price is the composition of its rules | Priya's standard rate is HOURLY + HOURLY_AFTER + DAY_MULTIPLIER for one service kind. One term per service kind stays true. Composition rules are documented in `entities/agreement.ts` |
| C2 | `DAY_MULTIPLIER.appliesTo: BASE_RATE \| ALL_HOURLY_RATES \| UNSPECIFIED` | "Time and a half" doesn't say whether the late rate is multiplied. UNSPECIFIED is honest; the checker computes where readings agree |
| C3 | **Revised:** helper `role` is free text; services are per-helper `serviceKey` slugs (term ↔ bill line), replacing the `HelperRole` and `ServiceKind` enums. `PaymentMethod.OTHER` added | Unseen helper types are expected. No logic branches on role or service. Risk: near-duplicate keys; mitigated by giving extraction the helper's existing keys and validating keys at `record_bill` |
| C4 | Money is integer cents everywhere, including tool and extraction schemas (`*Cents` fields) | One representation, no float math |
| C5 | **Revised:** helper profiles are saved directly (tool `save_helper`, routes `POST /api/helpers`, `POST /api/helpers/:id`). No confirmation | Gating profile edits was cumbersome. Terms, approvals, messages and engagement ends stay gated |
| C6 | `basedOnVersion` → `basedOn: ActionBasis` (HELPER_VERSION, BILL_VERSION, TERM_SLOT, NONE) | A term change is based on "the term in this slot", not a single row version. Explicit kinds, no inferring from null |
| C7 | LineItem gains `serviceDate`, `unitPriceBilledCents`, `relatedLineId`, `sourceQuote`; `serviceKey` nullable; `LineKind.REIMBURSEMENT` | Lupe's lines have dates but no times. Theo states unit prices. Priya's fee hangs off a visit. Unknown service stays null |
| C8 | BillCheck: typed `findings[]` union, severity tables (`LINE_STATUS_SEVERITY`, `BILL_FINDING_SEVERITY`, `VERDICT_BY_WORST_SEVERITY`), `agreedTotalCents` | §3.3 verdict table as data. "Expected total" ($556 for Priya) has a name |
| C9 | Theo: lines `MATCHES`; `QUANTITY_UNVERIFIABLE` + `OCCURRENCE_COUNT_PLAUSIBILITY` (20 billed vs **22** weekdays) as INFO findings | A line can't be both "rate correct" and "unverifiable". No holiday calendar exists, so the count is 22, not 21; the bill's own remark explains Labor Day |
| C10 | `BillingPeriodState.CHECKED_NEEDS_INFO` | NEEDS_INFO is not "flagged" and not "ok" |
| C11 | `HelperNote.noteKind: UNENCODED_TERM \| REVIEW_FLAG` + `billId` | `flag_for_review` needs somewhere to persist |
| C12 | Bill: `helperRemarks[]`, `supersededByBillId`, nullable `statedTotalCents` | "No walk on Labor Day" is worth keeping. Some bills state no total |
| C13 | `Approval.approvedBy: ActionResolver` (USER_UI), not `JORDAN`. Household has no list of people | Single user: whoever logs in decides |
| C14 | `DocumentKind.CHAT_STATEMENT` | "Lupe goes to $150 on the 15th" typed in chat is a source too |
| C15 | Extraction names helpers by name; the agent maps names → ids. Bill extraction lines use `relatedLineIndex` | The quarantined call has no ids |
| C16 | `PaymentRecord` entity, route `POST /api/bills/:id/payment`, month state `PAID` | Jordan can mark an approved bill as paid without editing the sealed bill |
| C17 | `record_bill` runs `checkBill` before returning | A bill is never stored unchecked |
| C18 | `amountApprovedCents` = sum of the lines, never the stated total. `billedCents` keeps the stated total for display | The stated total is never trusted. Priya approved with her total mismatch accepted → $596, not $626 |
