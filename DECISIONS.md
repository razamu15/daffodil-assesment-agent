# Decisions (raw compilation)

A raw collection of every decision found in the planning docs, the code and the git history, grouped by area. Copied over and lightly normalized, not re-argued. Meant to be edited down later.

**Format of each entry:** the decision, *why*, *alternatives* (only where a source states them), and *source*. Where two sources say the same thing, the entry lists all of them. Where they disagree, the entry says so and the disagreement is also listed in [Conflicts and duplicates](#conflicts-and-duplicates) at the end.

**Source shorthand**

| Short | File |
|---|---|
| PS | `working_docs/product-spec_latest.md` |
| SD | `working_docs/system-design_latest.md` |
| AD | `working_docs/agent-design_latest.md` |
| BP | `working_docs/build-plan_latest.md` |
| TA, TB, TC, TD | `working_docs/tracks/track-{a-rules,b-brain,c-face,d-house}_latest.md` |
| IR | `infra/README.md` |
| git `abc1234` | a commit (message and changed files) |

Code paths are given in full.

## Contents

1. [Product](#1-product)
2. [Domain model](#2-domain-model)
3. [Checker](#3-checker)
4. [Agent](#4-agent)
5. [Memory](#5-memory)
6. [API and auth](#6-api-and-auth)
7. [UI](#7-ui)
8. [Infra and deploy](#8-infra-and-deploy)
9. [Process](#9-process)
10. [Assumptions log (starter pack)](#10-assumptions-log-starter-pack)
11. [Deferred problems and named future fixes](#11-deferred-problems-and-named-future-fixes)
12. [Conflicts and duplicates](#conflicts-and-duplicates)

---

## 1. Product

**PR-01. The product line: the assistant checks, explains and drafts. It never moves money and never sends messages on its own.**
Why: "That sentence is the product. Everything below follows from it."
Source: PS §1.

**PR-02. What it does and doesn't do (the "line" table).**
- Learns agreements from notes, threads, screenshots, but doesn't save them without Jordan's confirmation (brief requires it).
- Shows which bills have arrived, but doesn't receive bills itself (out of scope; a real product would read an inbox).
- Checks bills against agreements, but doesn't pay anyone (no Venmo/Zelle access; a real product might auto-pay clean bills under a cap).
- Flags discrepancies in plain words, but doesn't decide for Jordan (money decisions are Jordan's).
- Drafts messages to helpers, but doesn't send them (notifications out of scope; outward-facing; a real product would send after Jordan's OK).
- Records "approve for payment" and locks the bill; doesn't edit approved bills (brief: approved is immutable).
- Handles a mid-month goodbye; doesn't run on its own schedule (bills arrive only when Jordan provides them; a real product would have a monthly run).
- Shows who to pay, how and how much; doesn't track whether visits happened (see PR-12; a real product would keep a visit log).
Source: PS §2.

**PR-03. Read-only on money. The assistant never pays.** (P1)
Why: no bank access; also the safest design.
Source: PS §5 P1; BP §1; SD §8.

**PR-04. "Approve" means "good to pay", not "pay".** (P2)
Why: brief requires approval and immutability; it's a record, not a transfer. Jordan pays through Venmo or Zelle outside the app.
Source: PS §2, §5 P2; BP §1 ("Approve flow: Validate, ask helper if off, approve for payment (no money moves)").

**PR-05. The discrepancy path is "ask the helper", not "approve a corrected amount".** (P3)
Why: Jordan can't unilaterally change what a helper billed; matches real life.
Source: PS §5 P3, §10.

**PR-06. No scheduler. Month status runs when Jordan opens the app or asks.** (P4)
Why: a schedule can't see bills; they only arrive when Jordan pastes them. Production would use EventBridge Scheduler.
Source: PS §5 P4, §9; BP §1 ("Scheduling: None"); AD §5 ("On-open month status (the scheduler replacement)": plain code, not a model call; the model runs only when Jordan asks something).

**PR-07. Messages are drafted, not sent.** (P5)
Why: notifications are out of scope; outward-facing actions need Jordan. Jordan edits, confirms, then copies or opens in Messages; the app records the hand-off.
Source: PS §4.5, §5 P5; BP §1; `apps/web/src/screens/decisions/MessageList.tsx`.

**PR-08. Mid-month settlement is supported via partial periods and ended helpers.** (P6)
Why: requested by the author; real households switch helpers. Jordan says "Lupe's last day is Oct 14", the assistant proposes ending the engagement, then expects a final bill for the partial period.
Limit: without a visit log, settlement means "I'll check the final bill when it arrives", not "here's what you owe". Goes in DESIGN.md.
Source: PS §4.7, §5 P6, §6.

**PR-09. Multiple chats are saved and listable.** (P7)
Why: cheap, and it's an audit trail.
Source: PS §5 P7, §10; BP §1.

**PR-10. Long-term memory is on, for soft facts only.** (P8)
Why: brief requires memory across conversations.
Source: PS §5 P8, §10; BP §1. See §5 Memory.

**PR-11. "Approve with accepted exceptions" stays available as a quiet secondary action ("Approve anyway...").** (P9, A1)
Why: Jordan may know better than the bill (e.g. Sam really did OK the $40 fee). If "ask the helper" were the only path, a flagged bill would be stuck until the helper reissues, and the brief says Jordan must be able to approve a bill.
Source: PS §5 P9 and note; AD §8 A1; BP §10 #1. (Duplicate across three docs.)

**PR-12. Services rendered: light plausibility checks only (option B).** (P11, A2)
Why: the brief asks "is this what we agreed to?", a question about terms. But the data hints at counts (Theo's walks vs weekdays, Lupe's Tuesdays), and option B is free: it uses schedule fields already extracted. Plausibility results are informational notes only; they never change the supported amount or block "checks out".
Alternatives: A. Terms only (simplest, says nothing about counts). C. Visit log (real proof, enables "what do I owe to date?", but daily data entry; out of scope).
Source: PS §5 P11, §6; AD §8 A2; BP §10 #2; `packages/core/src/checker/plausibility.ts`.

**PR-13. Corrected bills replace earlier ones.** (P10, A3)
Why: real flow after "ask the helper". A new bill for the same helper and period supersedes the old unapproved one, which is kept as SUPERSEDED.
Source: PS §5 P10; AD §4.3, §8 A3; BP §10 #3; `packages/core/src/records/bills.ts`.

**PR-14. (Sensitive, S1) A corrected bill for a month that's already approved is not saved.**
Exact same period: refused with `PERIOD_ALREADY_APPROVED`. Only overlapping the approved period: saved, and its check carries a `PERIOD_ALREADY_APPROVED` finding (a discrepancy).
Why: an approved bill is sealed; replacing it would quietly undo Jordan's approval and could lead to paying twice.
Risk: if the helper genuinely made a mistake after approval, there's no in-app path; Jordan handles it outside the app. Future fix: a separate "adjustment bill" for an approved period.
Source: PS §5 S1; `packages/core/src/records/bills.ts`; system prompt (`packages/agent/src/prompt/systemPrompt.ts`, BILLS). See conflict C-06 for how AD §6 words it.

**PR-15. One user. Whoever logs in can confirm and approve. No household members list.** (P12)
Why: multi-user is out of scope.
Source: PS §5 P12; AD §2.3 Household, §10 C13; BP §9 assumption 9; TC "No household members anywhere".

**PR-16. Mark as paid on approved bills.** (P13)
Why: Jordan needs to see what's been paid. Date, method, optional note. No confirm step: the click is Jordan's own statement. The bill stays sealed.
Source: PS §4.6a, §5 P13; AD §2.3 PaymentRecord, §10 C16.

**PR-17. Helper profiles save without confirmation. Terms, approvals, messages and engagement ends still need it.** (P14)
Why: gating name/phone edits was cumbersome.
Source: PS §5 P14, §8; AD §2.3 Helper, §10 C5; TA/TB/TC "ALSO" sections; `packages/core/src/records/helpers.ts`.

**PR-18. Approval pays the sum of the lines, never the stated total. A wrong total is shown and must be accepted as an exception.** (P15)
Why: totals are derived; the helper's total is a claim. Priya approved with her total mismatch accepted is $596, not $626.
Source: PS §5 P15; AD §10 C18; BP §9 assumption 7; `packages/core/src/records/billAmounts.ts`; `apps/web/src/screens/bill/ApproveDialog.tsx`; system prompt.

**PR-19. Two ways a discrepancy is resolved.** The helper sends a corrected bill (replaces the old one, checked again), or Jordan says "talked to Priya, the bill is correct": the assistant proposes approval with flagged items as accepted exceptions and Jordan's reason. If the talk changed the deal going forward, it also proposes an agreement change.
Source: PS §4.5; AD §4.3 (`propose_bill_approval`); TB "ALSO"; system prompt (BILLS).

**PR-20. Every checked bill gets exactly one verdict: CHECKS_OUT, DISCREPANCIES or NEEDS_INFO.**
Source: PS §4.4; AD §3.3.

**PR-21. Trust features.** Source beside extraction; every number has a "why"; assumptions are visible ("Assumed Sep 15", one click to change); plain words, not codes; approved bills look locked (no edit controls render); it says what it can't know; nothing is silent (every gated change goes through a visible confirm step; profile edits save directly but are always visible).
Source: PS §8.

**PR-22. Deliberately out of scope.** Real payments and bank links (brief), sending SMS/email/push (brief), automatic bill intake (brief), scheduled runs (P4), visit log (§6 option C), multi-user and multiple households (brief), tax or 1099 reporting (not asked).
Source: PS §9; BP §9 DESIGN.md "Left out" adds Cognito, other regions (pinned to `us-east-1`), household time zone.

**PR-23. The app starts empty.** The first screen says "Add what you have" with the assistant beside it, ready for the starter-pack folder.
Source: PS §7; `apps/web/src/screens/month/HomeScreen.tsx`.

**PR-24. Behavior on unseen inputs: use the rule engine where it fits, say "I can't check this" where it doesn't, never invent.**
Drill list: new helper type (tutor $60/hr, 1h minimum), rule outside the vocabulary ("$10 extra for the second child"), a different bill layout, a duplicate line, a future-dated rate change, a bill from a helper with no agreement, hours crossing midnight on a Sunday.
Source: BP §6.5.

**PR-25. Decisions the author made up front.** TypeScript everywhere, React frontend, npm; hand-rolled agent loop; long-term memory on; multiple chats; approve flow = validate, then ask the helper if off; auth kept simple with options listed.
Source: PS §10.

---

## 2. Domain model

### 2.1 Modeling strategies

**DM-S1. Things that change are stored as versioned rows with effective dates.**
Why: overwriting loses history (Sep 1 would be checked against the new rate, exactly Lupe's case). An event log is great for audit but you replay to see "now". Versioned rows give readable current state and full history.
Alternatives: (a) overwrite the row, (b) event log only.
Source: AD §2.2 S1; `packages/domain/src/entities/agreement.ts`.

**DM-S2. Embed what never lives alone, separate what's queried alone.** (Mixed)
Line items embedded in a bill; terms are separate (queried by helper and date).
Alternatives: (a) normalize and join at read, (b) embed children in the parent.
Source: AD §2.2 S2.

**DM-S3. Typed core plus a notes escape hatch.**
Why: typed-only breaks on the first unexpected term; free JSON can't be checked by code. Typed core checks what we understand and stores the rest honestly.
Alternatives: (a) typed fields only, (b) free JSON.
Source: AD §2.2 S3.

**DM-S4. "Don't know" is an explicit `UNKNOWN` enum value for domain facts.**
Why: a default is a lie that looks real; `null` is easy to misread as "no"; `UNKNOWN` is self-describing.
Alternatives: (a) a default (`false`, `0`), (b) `null`.
Source: AD §2.2 S4.

**DM-S5. Derive facts when you can (status is derived, not stored).**
Why: stored status drifts. Month status is computed from bills, helpers, policy (and messages, payments) on read and needs no scheduler.
Alternatives: store status everywhere.
Source: AD §2.2 S5, §2.3 BillingPeriodStatus; PS §3; `packages/core/src/monthStatus.ts`.

**DM-S6. At approval, freeze a snapshot rather than point at current records.**
Why: a later rate change must never rewrite what Jordan approved.
Alternatives: point at current records.
Source: AD §2.2 S6, §2.3 Approval.

### 2.2 Entities

**DM-01. Household holds the billing policy** (`cadence: MONTHLY_IN_ARREARS`, `expectedByDayOfMonth`).
Why: "we pay at the start of the month for the previous month" is a household rule, not a helper rule. `expectedByDayOfMonth` is `null` until Jordan says; no invented due date.
Alternatives: hardcoding the rhythm as constants (hides a domain rule).
Source: AD §2.3 Household.

**DM-02. Helper `houseKeyAccess` is a 3-value enum: `HAS_KEY | NO_KEY | UNKNOWN`.**
Why: notes only say Lupe has a key; for Priya and Theo it's unknown, not "no key". It also drives behavior: ending Lupe's engagement reminds "Lupe has a key."
Source: AD §2.3 Helper; BP §6.3 (trap); `packages/core/src/actions/proposals.ts` (reminder by key access).

**DM-03. Helper `role` is free text; services are per-helper `serviceKey` slugs, not global enums.** (C3, revised)
Why: no logic branches on role or service; unseen helper types (a tutor) must be recordable without a code change. The key only has to match between a term and a bill line.
Risk: near-duplicate keys; mitigated by giving extraction the helper's existing keys and validating keys at `record_bill`.
Alternatives: `HelperRole` and `ServiceKind` enums (replaced); a term-per-helper-type table.
Source: AD §2.3 Helper and AgreementTerm, §2.4, §10 C3; TB "ALSO".

**DM-04. Helpers are never deleted; they end** (`status: ACTIVE | ENDED`, `endedOn`).
Why: mid-month settlement. Status and endedOn change only through `HELPER_ENGAGEMENT_END`.
Source: AD §2.3 Helper; `packages/core/src/records/helpers.ts`.

**DM-05. Payment and contact details live on the Helper.**
Why: they're facts about the person, not about a deal. `PaymentMethod.OTHER` added (C3).
Alternatives: a free-form `attributes` map (can't drive behavior; typos become new fields).
Source: AD §2.3 Helper, §10 C3.

**DM-06. Optimistic concurrency via `version` on mutable records.**
Source: AD §2.3 Helper; SD §5 "Concurrency tools".

**DM-07. SourceDocument is a separate, immutable entity that terms and bills point at.**
Why: one thread often yields several terms (Lupe's thread gives regular, deep clean and the later change).
Alternatives: a `source` string on each fact (duplicates, can't show the original, can't be reused).
Source: AD §2.3 SourceDocument; `packages/core/src/records/documents.ts`.

**DM-08. SourceDocument keeps `messageDate`.**
Why: "starting the 15th" can only be resolved against the date of the message.
Source: AD §2.3 SourceDocument.

**DM-09. SourceDocument keeps `fileName`** (null for pasted text and chat statements). (2026-10-16)
Why: names the attachment in chat (and the chat itself when the first message is only files), and the model sees it ("07-lupe-september-bill.png" is a useful hint).
Source: AD §2.3 SourceDocument; git `52ec183`.

**DM-10. Formats: images and PDFs stored as blobs (PDFs reach the model as a document block); any text file stored as text; other formats refused with a reason.** (2026-10-16)
Source: AD §2.3 SourceDocument; git `480cc8f`; `apps/web/src/lib/fileIntake.ts`.

**DM-11. Uploaded files are typed by format only (`TEXT_FILE`, `IMAGE_FILE`, `PDF_FILE`). Jordan doesn't pick what a file is; the assistant reads it as an agreement or a bill from its contents. Pasted text still says what it is.**
Why: removes the per-file kind dropdown. "A bill never defines terms" no longer rests on the kind Jordan picked: a document that any bill was recorded from can't be read as an agreement or cited as a term source (`refuseIfRecordedAsBill`).
Source: AD §2.3 SourceDocument; git `2704d92`; `packages/agent/src/tools/documents.ts`; `packages/domain/src/constants.ts` (`TERM_SOURCE_DOCUMENT_KINDS`); `apps/web/src/screens/chat/Composer.tsx`.

**DM-12. `DocumentKind.CHAT_STATEMENT`: something Jordan types in chat ("Lupe goes to $150 on the 15th") is a source too.** (C14)
It is saved as a SourceDocument only when a tool first cites its docId, so ordinary chat doesn't pile up documents.
Source: AD §10 C14; `packages/agent/src/tools/context.ts`, `packages/agent/src/tools/documents.ts`.

**DM-13. AgreementTerm carries `sourceQuote` and `assumptions[]`.**
Why: every number can show its "why"; "Assumed Sep 15" is data, not a hidden guess.
Source: AD §2.3 AgreementTerm; `packages/domain/src/entities/agreement.ts`.

**DM-14. One term per `serviceKey` per helper.**
Why: Lupe's regular visit changed and her deep clean didn't; they move independently.
Alternatives: one overwritten "rate card" per helper.
Source: AD §2.3 AgreementTerm.

**DM-15. A term's price is the composition of its `pricingRules[]`** (was one `pricingRule`). (C1)
Why: Priya's standard rate is HOURLY + HOURLY_AFTER + DAY_MULTIPLIER for one service. A change to any component is a new version of the whole term.
Source: AD §10 C1; `packages/domain/src/entities/agreement.ts`.

**DM-16. Rule composition rules.** HOURLY is the base for hours no other hourly rule claims; HOURLY_AFTER takes hours at/after `afterTime` through midnight to the line's end, latest `afterTime` wins; FLAT_BLOCK covers start to `untilTime`, overage priced by a HOURLY_AFTER whose `afterTime == untilTime`, else CANNOT_COMPUTE; DAY_MULTIPLIER scales hours on `dayOfWeek` limited by `appliesTo`; FLAT_PER_UNIT is amount times quantity (VISIT or WALK); FEE covers a FEE line whose label matches.
Source: `packages/domain/src/entities/agreement.ts` header.

**DM-17. PricingRule is a tagged union evaluated by one engine; helpers differ only in data.**
Alternatives: a column per rate type (sparse, breaks on the next rule); a coded function per helper (hardcodes people).
Source: AD §2.3 PricingRule, §7.

**DM-18. A term that fits no rule kind becomes a HelperNote, never forced into the nearest rule. Lines touching it are CANNOT_COMPUTE.**
Why: S3 escape hatch. A pile of similar notes signals which rule kind to add next.
Source: AD §2.3 PricingRule and HelperNote, §6; `packages/domain/src/entities/agreement.ts`; system prompt.

**DM-19. `DAY_MULTIPLIER.appliesTo: BASE_RATE | ALL_HOURLY_RATES | UNSPECIFIED`.** (C2)
Why: "time and a half" doesn't say whether the late rate is multiplied. UNSPECIFIED is honest; the checker computes where readings agree.
Source: AD §10 C2; `packages/core/src/checker/timedPricing.ts`.

**DM-20. ServiceSchedule: `WEEKLY_ON | WEEKDAYS | AD_HOC | UNSPECIFIED`.**
Why: feeds plausibility notes. "No fixed schedule" (AD_HOC) and "we don't know" (UNSPECIFIED) are different facts.
Source: AD §2.3 ServiceSchedule; PS §6.

**DM-21. Future-dated terms are legal** (the vacation case, "goes up in January").
Source: AD §2.3 AgreementTerm; BP §6.5.

**DM-22. Bill period is a range with a kind: `CALENDAR_MONTH | CUSTOM_RANGE | FINAL_SETTLEMENT`.**
Why: a `"2026-09"` string can't express "Oct 1 to 14" for a final settlement. One shape, three kinds.
Source: AD §2.3 Bill.

**DM-23. `statedTotal` is stored but never trusted; nullable (some bills state no total).** (C12)
Why: it's what the helper wrote; compared with the sum of lines (Priya's $626 vs $596).
Source: AD §2.3 Bill, §10 C12; `packages/core/src/records/billAmounts.ts`.

**DM-24. Line items are embedded in the bill.**
Why: they don't exist outside a bill, and the approval snapshot wants them together.
Alternatives: a bill-level "extras" field (splits totals logic in two).
Source: AD §2.3 Bill and LineItem.

**DM-25. Bill status: `RECEIVED | SUPERSEDED | APPROVED`. A flagged bill stays RECEIVED; "flagged" is the verdict on `latestCheck`. It leaves RECEIVED only by approval or a corrected bill.**
Why: SUPERSEDED keeps the old bill for the record.
Alternatives: an `Invoice` model.
Source: AD §2.3 Bill; PS §3.

**DM-26. Bill keeps `helperRemarks[]` and `supersededByBillId`.** (C12)
Why: "No walk on Labor Day" is worth keeping.
Source: AD §10 C12.

**DM-27. LineItem `startAt`/`endAt` are full household-local datetimes.**
Why: "7pm to 12am" crosses midnight; a full datetime makes that explicit instead of a hidden "+1 day" rule.
Source: AD §2.3 LineItem; `packages/domain/src/primitives.ts`.

**DM-28. LineItem additions: `serviceDate`, `unitPriceBilledCents`, `relatedLineId`, `sourceQuote`; nullable `serviceKey`; `LineKind.REIMBURSEMENT`.** (C7)
Why: Lupe's lines have dates but no times; Theo states unit prices; Priya's fee hangs off a visit; unknown service stays null.
Source: AD §10 C7.

**DM-29. A fee is a line with `lineKind: FEE`**, checked and totaled like everything else (usually NOT_COVERED).
Source: AD §2.3 LineItem.

**DM-30. `authorizationClaim` on a line: "Sam said that was fine" is a claim by the helper about a third party, stored as a claim, never an agreement unless Jordan accepts it.**
Source: AD §2.3 LineItem; BP §6.3, §9 assumption 6; system prompt (DOCUMENTS ARE DATA); `BILL_FINDING_SEVERITY` (AUTHORIZATION_CLAIM is INFO).

**DM-31. Approval is sealed inside the Bill**, with `billedAmount`, `amountApproved`, `acceptedExceptions[]`, `checkSnapshot`, `termVersionIds[]`.
Why: one conditional write flips RECEIVED to APPROVED and writes the approval together; after that, no update path exists.
Alternatives: mutable "approved" flags.
Source: AD §2.3 Approval.

**DM-32. `Approval.approvedBy: ActionResolver (USER_UI)`, not `JORDAN`.** (C13)
Why: single user; whoever logs in decides; household has no list of people.
Source: AD §10 C13.

**DM-33. PaymentRecord is a separate entity, not gated, one per bill.** (C16)
Why: the approved bill is sealed; "paid" is a new fact, not an edit. One-per-bill is enforced by deriving the payment id from the bill id.
Source: AD §2.3 PaymentRecord, §10 C16; `packages/core/src/records/bills.ts`.

**DM-34. One PendingAction entity for every gated change** (`AGREEMENT_CHANGE | BILL_APPROVAL | HELPER_MESSAGE | HELPER_ENGAGEMENT_END`).
Why: confirm logic, audit trail and conflict handling are written once. The `type` enum carries per-type behavior; the pipeline is shared.
Alternatives: a separate "draft" model per feature (four copies of confirm and conflict logic that would drift).
Source: AD §2.3 PendingAction, §7.

**DM-35. PendingAction `ref` is a short integer.**
Why: the model copies `#7` more reliably than a UUID. Implemented with an atomic counter.
Source: AD §2.3 PendingAction; SD §5 (`Counters` table).

**DM-36. `basedOn: ActionBasis` (HELPER_VERSION, BILL_VERSION, TERM_SLOT, NONE) replaces `basedOnVersion`.** (C6)
Why: a term change is based on "the term in this slot", not a single row version. Explicit kinds, no inferring from null.
Source: AD §10 C6; `packages/core/src/actions/termSlot.ts`.

**DM-37. PendingAction statuses: `PENDING` then one of `CONFIRMED | REJECTED | WITHDRAWN | SUPERSEDED | STALE | EXPIRED`; every non-PENDING status is terminal.** Transitions are a table.
Source: AD §2.3, §4.6; `packages/domain/src/constants.ts` (`PENDING_ACTION_TRANSITIONS`).

**DM-38. OutboundMessage `deliveryMode` is data (always `MANUAL_HANDOFF` today).**
Why: real sending later is a new mode, not a rewrite.
Alternatives: storing drafts only in the chat (the record "we asked Priya on Oct 14" is useful later).
Source: AD §2.3 OutboundMessage.

**DM-39. Message status is `HANDED_OFF`, never `SENT`.**
Why: we can't know it was sent. Honest status names. Repeating "I sent it" is harmless.
Source: AD §2.3 OutboundMessage; `packages/core/src/records/messages.ts`.

**DM-40. HelperNote `noteKind: UNENCODED_TERM | REVIEW_FLAG`, plus `billId`.** (C11)
Why: `flag_for_review` needs somewhere to persist.
Source: AD §10 C11; `packages/agent/src/tools/escape.ts`.

**DM-41. Chat messages are not stored in the DB; they live in AgentCore short-term events. Turn is separate.**
Why: two copies would drift. Turn holds the trace because runs aren't reproducible; keeping it out of chat history keeps history clean. `activeTurnId` is the per-session lock.
Source: AD §2.3 Session and Turn.

**DM-42. BillingPeriodState includes `CHECKED_NEEDS_INFO`** (C10) **and `PAID`** (C16).
Why: NEEDS_INFO is neither "flagged" nor "ok".
Source: AD §10 C10, C16; `packages/domain/src/constants.ts` (`PERIOD_STATE_BY_VERDICT`).

**DM-43. Shared enums have one home: `packages/domain`.**
Source: AD §2.4, §7.

**DM-44. Money is integer cents everywhere, including tool and extraction schemas (`*Cents` fields).** (C4)
Why: one representation, no float math. Signed only for ADJUSTMENT credits.
Source: AD §10 C4; `packages/domain/src/primitives.ts`; system prompt ("Tools speak integer cents. Speak dollars to Jordan.").

**DM-45. Dates and times are household-local strings with no time zone; only system timestamps are absolute instants.**
Source: `packages/domain/src/primitives.ts`; SD §6 "Time".

**DM-46. A helper's services are AGREED (saved term) or PROPOSED (in a pending agreement change).** (2026-10-16)
Why: a bill that arrives together with the helper's rates can name its lines' services before the rates are confirmed; confirming them re-checks the bill. AGREED wins over PROPOSED.
Source: AD §2.3 SourceDocument ("A bill with its helper's rates in one message"); git `2704d92`; `packages/core/src/helperServices.ts`.

**DM-47. Source precedence rank per DocumentKind** (lower is more reliable): THREAD_SCREENSHOT 1, CHAT_STATEMENT 1, PASTED_THREAD 2, TYPED_NOTES 3, IMAGE_FILE 1, TEXT_FILE 2, PDF_FILE 2, BILL_TEXT 4, BILL_SCREENSHOT 4.
Why (uploads): an image is most often a screenshot of the helper's own message. Bills are ranked only so every kind has an entry.
Source: `packages/domain/src/constants.ts` (`SOURCE_PRECEDENCE_RANK`); AD §3.5.

---

## 3. Checker

**CK-01. Model understands, code decides.** Reading messy input and structuring it: model (quarantined, forced schema). Comparing, calculating, enforcing, committing: code. Explaining: model. Saying yes: Jordan, through a UI button.
Source: AD §1.

**CK-02. `checkBill` is pure and deterministic: same inputs, same check. No model.**
Source: AD §3; `packages/core/src/checker/checkBill.ts`.

**CK-03. Line statuses: MATCHES, DIFFERS, NOT_COVERED, CANNOT_COMPUTE, UNVERIFIABLE. Never collapse "unknown" into "matches".**
Source: AD §3.1; PS §4.3.

**CK-04. Bill-level checks:** stated total vs sum of lines; lines outside the period; duplicate date and service; service with no agreement; period already approved; plausibility notes (informational).
Source: AD §3.2; `packages/core/src/checker/findings.ts`.

**CK-05. Verdict derivation is data: severity per line status and per finding kind, worst severity picks the verdict.** Any DIFFERS/NOT_COVERED/total mismatch: DISCREPANCIES; else any CANNOT_COMPUTE: NEEDS_INFO; else CHECKS_OUT (with any INFO notes). (C8)
Source: AD §3.3, §10 C8; `packages/domain/src/constants.ts` (`LINE_STATUS_SEVERITY`, `BILL_FINDING_SEVERITY`, `SEVERITY_RANK`, `VERDICT_BY_WORST_SEVERITY`); `packages/core/src/checker/severity.ts`.

**CK-06. BillCheck has typed `findings[]` and a named `agreedTotalCents`** ("expected total", $556 for Priya). (C8)
Source: AD §10 C8.

**CK-07. When any line can't be computed, the agreed total is unknown; the checker won't guess a total.**
Source: `packages/core/src/checker/checkBill.ts`.

**CK-08. Bills are checked against the term in effect on each line's date (versioned rows).**
Source: AD §2.3 AgreementTerm; `packages/core/src/checker/terms.ts`.

**CK-09. The earliest version of each service also covers every date before its `effectiveFrom`.** (Decided 2026-10-16)
Why: a first rate's `effectiveFrom` is usually just the day it was written down. Without this, saving a rate on the 15th would make the first half of the month look uncovered. Only the earliest version reaches back.
Alternatives: an explicit "open start" value on `effectiveFrom` (most precise, much larger change); a `startBasis` flag (keeps a date that means "when we learned it").
Known edge: a first rate whose start *was* stated ("we start Sept 1") also covers earlier dates. Acceptable: bills before a helper started are rare, and Jordan sees the bill anyway.
Source: AD §2.3 AgreementTerm; git `480cc8f`; `packages/core/src/checker/terms.ts`, `packages/core/src/termVersions.ts`; system prompt (LEARNING AGREEMENTS, "Start dates").

**CK-10. `ADD_EARLIER_TERM`: when Jordan learns an older rate, one confirmed change adds it (with its `effectiveTo`) and moves the earliest saved version's `effectiveFrom` to the day after.** That's the only change besides closing that edits an existing row (version bumped).
Source: AD §2.3 AgreementTerm; git `480cc8f`; `packages/core/src/actions/apply.ts`; `packages/domain/src/entities/agreement.ts`; system prompt.

**CK-11. Likely cause for differing lines (`RATE_FROM_OTHER_PERIOD`), computed in code.** When a line DIFFERS, the checker prices it under the same service's other versions; if one charges exactly what was billed, the line gets a likely cause and a plain-words explanation ("$150 is the newer rate, which only starts Sep 15...").
Why: code, not the model, so the same bill always gets the same story; the review screen, Home and the agent all read it from the check.
Source: AD §3 ("Likely cause (2026-10-16)"); git `52ec183`; `packages/core/src/checker/lineChecks.ts`; system prompt (lead with the likelyCause story, warmly).

**CK-12. A bill line's `serviceKey` must be one of the helper's existing keys (agreed or proposed) or null. `record_bill` refuses an invented key and names the real ones.** (2026-10-16)
Why: seen in testing: "after school" saved as a new key `after-school` made Priya's ordinary hourly line show "no agreement". A line described by when or why it happened is the helper's regular hourly service.
Source: AD §2.3 AgreementTerm; git `5990327`, `2704d92`; `packages/core/src/records/bills.ts`; system prompt (BILLS).

**CK-13. A service-key with no term at all for the helper is NOT_COVERED / NO_AGREEMENT_FOR_SERVICE.**
Source: TA "ALSO"; `packages/core/src/checker/findings.ts`.

**CK-14. Rates named instead of stated ("my late rate"): extraction encodes them from the same document when it states the rate; the agent resolves them across documents and saved terms. When a check fails on a missing rate the helper's sources state, the agent proposes adding it (Jordan confirms; the bill re-checks).** Only when nothing fits, or more than one could, is it saved as a note and Jordan asked.
Source: AD §2.3 AgreementTerm; git `480cc8f`, `5990327`; system prompt (LEARNING AGREEMENTS, BILLS).

**CK-15. Source precedence when inputs disagree:** 1 direct dated message from the helper; 2 pasted copy of a thread (may be partial); 3 Jordan's typed notes (from memory, undated); 4 a bill (not an agreement, a claim). Newer beats older for the same helper and service; direct beats notes (Theo: $28 text beats $25 notes). The assistant proposes, shows both sides, Jordan decides.
Source: AD §3.5, §6; BP §6.3, §9 assumption 5; `packages/domain/src/constants.ts`; system prompt.

**CK-16. A bill never defines terms.** If it charges $28 and no term says $28, the line is NOT_COVERED or DIFFERS. Enforced at the tool boundary: a document a bill was recorded from can't be read as an agreement or cited as a term source.
Source: AD §3.5; `packages/agent/src/tools/propose.ts`, `packages/agent/src/tools/documents.ts`, `packages/agent/src/extraction/extract.ts`.

**CK-17. Plausibility findings are INFO only: they never change the supported amount and never block "checks out".**
Source: PS §6; `packages/core/src/checker/plausibility.ts`.

**CK-18. There is no holiday calendar; a weekday holiday still counts as a scheduled day.** So Theo's expected count is 22 weekdays, not 21; the bill's own remark explains Labor Day.
Source: AD §10 C9; BP §6.2; `packages/core/src/checker/plausibility.ts`. **Conflicts with PS §6** (see C-01).

**CK-19. Theo's lines are MATCHES; the walk count is a bill-level `QUANTITY_UNVERIFIABLE` INFO finding plus `OCCURRENCE_COUNT_PLAUSIBILITY`.** (C9)
Why: a line can't be both "rate correct" and "unverifiable".
Source: AD §3.1, §10 C9; BP §6.2.

**CK-20. Plausibility counting.** Per-unit services in the same unit are counted together (a deep clean in place of a regular visit still fills the slot); the finding lists every serviceKey counted. A time-priced scheduled service counts distinct billed dates. Any count we can't know means no finding rather than a guessed count.
Source: `packages/core/src/checker/plausibility.ts`.

**CK-21. Timed pricing: cut the line at every point where the rate could change (each `afterTime`, the block's `untilTime`, every midnight), price each piece, merge neighbours with the same rate.** Times are read on the clock of the day the line started, extended past midnight, so "after 10pm" keeps applying to 12:30am. The calendar day of a piece (for DAY_MULTIPLIER) is its real date.
Source: `packages/core/src/checker/timedPricing.ts`.

**CK-22. DAY_MULTIPLIER with UNSPECIFIED `appliesTo`: if the two readings (base only vs all hourly) disagree for a piece, it's CANNOT_COMPUTE.**
Source: `packages/core/src/checker/timedPricing.ts`; AD §10 C2.

**CK-23. Without times, only a plain hourly rate can be applied, to hours the bill states. An undated line can only be priced when one version covers the whole billing period.**
Source: `packages/core/src/checker/timedPricing.ts`, `packages/core/src/checker/terms.ts`.

**CK-24. Fee matching.** A fee belongs to its own service or to the line it hangs off (`relatedLineId`); with neither, every agreement in effect is searched for a fee with the same label; finding none is a fact (NOT_COVERED), not a guess. Labels compare case- and spacing-insensitively. A fee line is one occurrence unless it states a quantity.
Source: `packages/core/src/checker/lineChecks.ts`, `packages/core/src/checker/unitPricing.ts`.

**CK-25. Fractional cents are rounded to whole cents and the rounding is recorded as an assumption.** There is no third option where a missing input is filled with a guess.
Source: `packages/core/src/checker/price.ts`.

**CK-26. Duplicate lines: same service, same day, same times. Undated lines can't be duplicates.**
Source: `packages/core/src/checker/findings.ts`.

**CK-27. `record_bill` runs `checkBill` before saving; a bill is never stored unchecked.** No confirmation needed for recording.
Why: a bad bill is flagged on arrival anyway.
Source: AD §4.3, §8 A4, §10 C17; BP §10 #4; `packages/core/src/records/bills.ts`; `packages/agent/src/tools/record.ts`.

**CK-28. Confirming a term change re-checks the helper's open (RECEIVED) bills.** A re-checked bill's version moves, so any pending approval of it goes STALE. `latestCheck` is only rewritten when its content changed.
Source: SD §11; `packages/core/src/actions/apply.ts`, `packages/core/src/checker/checkBill.ts`.

**CK-29. Two checks are equal if everything but `checkedAt` (and the bill version) matches; key order ignored.**
Why: a check that went through a store or JSON round trip must still compare equal for the STALE test.
Source: `packages/core/src/checker/checkBill.ts`.

**CK-30. `check_bill` (the tool) runs a fresh check; it is read-only and doesn't rewrite `latestCheck`.**
Source: `packages/core/src/checker/checkStoredBill.ts`.

**CK-31. Rule kinds are evaluated through tables (`LINE_CHECKER_BY_KIND`, `PRICING_MODE_BY_RULE_KIND`), not branching.**
Source: `packages/core/src/checker/lineChecks.ts`; AD §7.

**CK-32. The starter-pack answer key is the oracle. If code disagrees, stop and report; never edit the key to match.**
Source: BP §6.2; TA "ORACLE".

---

## 4. Agent

**AG-01. Hand-rolled agent loop on the Bedrock Converse API.**
Source: PS §10; AD §4; BP §1. (See AG-21 for the Claude API alternative.)

**AG-02. One turn:** take session lock; load history from AgentCore short-term; retrieve long-term records as a "background hints" block; inner loop model and tools until text; write this turn's user and assistant events; save the Turn trace and release the lock in one commit. Any failure after step 1 ends the turn FAILED with its error and partial trace; the lock is released either way.
Source: AD §4.1; `packages/agent/src/loop/runTurn.ts`.

**AG-03. The system prompt is guidance only, not the safety layer.** The tool list is the real boundary; core enforces every gate.
Source: AD §4.2; `packages/agent/src/prompt/systemPrompt.ts`.

**AG-04. System prompt rules.** Truth: the database is truth, memory is a hint, never state a rate without a tool, never do bill arithmetic (the checker is the only judge). Honesty: say when you can't verify, never invent, show assumptions. Power: propose, not commit; typing "yes" in chat confirms nothing; after proposing say it's ready with its #ref, never "saved". Conflicts: explain and ask, never choose; withdraw only when Jordan asks. Limits: can't pay, send, edit approved bills or delete. Style: short plain sentences, numbers with their why, proposals as #ref.
Source: AD §4.2; `packages/agent/src/prompt/systemPrompt.ts`.

**AG-05. "Pay Lupe": honest refusal; offer to propose approval and say how that helper is paid.**
Source: system prompt (LIMITS); BP §4 Track B, §6.4.

**AG-06. "Remember this": no remember-on-command. A profile fact goes to `save_helper`; something agreed goes to an agreement proposal; anything else, say honestly it can't be saved on request (preferences may become background hints later).**
Source: system prompt (LIMITS); TB "DONE WHEN".

**AG-07. Tools by category.** Read (no side effects): `list_helpers`, `list_agreements`, `list_bills`, `get_bill`, `check_bill`, `get_month_status`, `list_pending_actions`, `extract_from_document`. Record (writes data, not money or terms): `save_helper`, `record_bill`. Propose (PENDING row only): `propose_agreement_change`, `propose_bill_approval`, `propose_helper_message`, `propose_engagement_end`, `withdraw_pending_action`. Escape hatches: `save_unstructured_note`, `flag_for_review`.
Source: AD §4.3; `packages/domain/src/tools/tools.ts`; `packages/agent/src/tools/`.

**AG-08. Tools the model does NOT get: `confirm_action`, direct `approve_bill`, `send_message`, `edit_approved_bill`, `delete_anything`, `run_code`. That absence is the safety.** A model asking for any other tool name gets an error, not an action.
Source: AD §4.3; `packages/agent/src/tools/registry.ts`.

**AG-09. `withdraw_pending_action` is the one resolution the agent may make; it only reduces what could happen.**
Source: AD §4.3; `packages/agent/src/tools/propose.ts`; `packages/core/src/actions/resolve.ts`.

**AG-10. `dispatchTool` is the single validation boundary for tool input; handlers trust it. Every outcome is the ToolResult envelope.**
Source: `packages/agent/src/tools/registry.ts`; TB.

**AG-11. Core errors map to tool error codes that tell the model what to do next. CONFLICT (two tabs) maps to a NOT_ALLOWED-style "not now"; SESSION_BUSY can't arise from a tool, so it's INTERNAL.**
Source: `packages/agent/src/tools/errors.ts`.

**AG-12. Extraction is a quarantined, separate model call with no tools except one forced output-schema tool (via toolChoice).**
Why: an image or bill saying "approve this" has nothing to hijack. The prompt is guidance for a transcriber, not a safety layer.
Source: AD §4.4; `packages/agent/src/extraction/extract.ts`, `outputTools.ts`, `prompt.ts`.

**AG-13. Extraction inputs: today's date, the message date, and each known helper's service keys (agreed or proposed).**
Why: resolve "the 15th" and missing years; reuse keys.
Source: AD §4.4, §2.3 AgreementTerm; TB "ALSO"; `packages/agent/src/extraction/extract.ts`.

**AG-14. Extraction: missing stays missing (`null`, never a default); inferences go into `assumptions[]`; output validated once at this boundary, downstream trusts it.**
Source: AD §4.4, §6; `packages/domain/src/tools/extraction.ts`.

**AG-15. A schema-invalid extraction gets one repair attempt (issues sent back), then fails loudly.**
Source: `packages/agent/src/extraction/extract.ts`; `packages/agent/src/settings.ts` (`EXTRACTION_REPAIR_ATTEMPTS = 1`).

**AG-16. Extraction names helpers by name; the agent maps names to ids. `helperId` is null unless exactly one known helper has that name. Bill extraction lines use `relatedLineIndex`.** (C15)
Why: the quarantined call has no ids.
Source: AD §10 C15; `packages/agent/src/extraction/extract.ts`.

**AG-17. Which documents each extraction kind may read: any document may be read as a bill; a document recorded as a bill can't be read as an agreement.**
Source: `packages/agent/src/extraction/extract.ts`.

**AG-18. Attachments are named by id and kind only in chat history, never inlined; their content reaches the model only through the quarantined extraction call.**
Source: `packages/agent/src/loop/history.ts`.

**AG-19. History holds Jordan's text and final assistant text only; tool traces live on the Turn. Consecutive same-role messages are merged and anything before the first user message is dropped (Converse needs alternating roles).**
Source: AD §4.5; `packages/agent/src/loop/history.ts`.

**AG-20. Tool calls in one model response run in order (they may depend on each other's writes). Stop reasons are a table; stops that leave no trustworthy answer (cut off, filtered) fail the turn loudly.**
Source: `packages/agent/src/loop/converseLoop.ts`.

**AG-21. Claude API swap: `AnthropicModel` (Messages API) behind the same `ModelClient` seam, selected by `MODEL_PROVIDER` (`anthropic` or `bedrock`).**
Why: Bedrock model access is blocked on the dev account (support case open); needed a real model to build and test. Messages is close to Converse, so the domain `ModelRequest` (which mirrors Converse) maps directly.
Settings: `anthropic` needs `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_ID` (`claude-sonnet-4-6`); `bedrock` needs `BEDROCK_MODEL_ID` (`us.anthropic.claude-sonnet-4-6`), `AWS_REGION`, AWS credentials. No default provider or model; missing settings throw before any model is called.
Stated scope: BP §5 and the `anthropicModel.ts` docstring say it's a local-development stand-in and the deployed Lambdas stay on Bedrock, which the brief requires. `.env.example` says nothing in it is used by the deployed stack.
Source: git `09b77c0`; BP §2 (seams table), §5 (I1, "Why the Claude API exists here"); `packages/agent/src/model/anthropicModel.ts`, `packages/agent/src/model/modelProvider.ts`; `.env.example`. See C-02.

**AG-22. Model: Claude Sonnet 4.6, not Sonnet 5.5.**
Why: Sonnet 5.5 (first pick) rejects three request shapes the agent relies on: forced `tool_choice` (extraction forces its schema tool), non-default `temperature` (0.2 and 0 are sent), and thinking turned off (it always returns thinking blocks, which `ModelMessage` has no slot for and which must be replayed unchanged). Sonnet 4.6 accepts all three.
Future fix: move to a 5.x model by dropping forced tool choice and temperature, and carrying thinking blocks through the loop.
History: git `7697498` pinned `us.anthropic.claude-sonnet-5-5`; git `09b77c0` changed it to `us.anthropic.claude-sonnet-4-6`.
Source: SD §6 "Why Sonnet 4.6, not Sonnet 5.5"; `infra/lib/deployConfig.ts`.

**AG-23. Anything the provider returns that the domain can't represent (unknown stop reason or content block) throws instead of being mapped to something plausible.** The Claude API `refusal` maps to the domain's `content_filtered`; `pause_turn` and `model_context_window_exceeded` throw. Messages has no JSON result block, so JSON goes as text.
Source: `packages/agent/src/model/bedrockModel.ts`, `packages/agent/src/model/anthropicModel.ts`.

**AG-24. Model ID and region are injected; nothing in the agent package is hardcoded. The agent never reads the environment; callers build its deps.**
Source: `packages/agent/src/model/bedrockModel.ts`, `packages/agent/src/deps.ts`, `packages/agent/src/settings.ts`, `packages/agent/src/model/modelProvider.ts`; TB "OUT OF SCOPE" (open decision #5: read from env). See C-09.

**AG-25. Harness tuning knobs:** agent temperature 0.2, extraction temperature 0, agent max tokens 4096, extraction max tokens 8192, at most 24 model calls per turn (then give up loudly), 40 history messages, top 5 hints, `PROMPT_VERSION` bumped when prompt or tool descriptions change so traces say which prompt produced them.
Source: `packages/agent/src/settings.ts`.

**AG-26. No-commit audit, two independent checks:** (1) trace: every successful tool is a domain tool; (2) state: nothing only a confirmation can produce appeared during the turn (CONFIRMED action, APPROVED bill, new term, ready message, ended helper). Used by tests and the scenario runner.
Source: `packages/agent/src/audit/noCommitAudit.ts`; BP §6.1 "Behavior"; TB "DONE WHEN".

**AG-27. FakeModel throws when run past the end of its script: an unexpected extra model call is a test failure, not a silent default.**
Source: `packages/agent/src/model/fakeModel.ts`.

**AG-28. Use the real model early in Track B, not only the fake.**
Why: a fake that's too well-behaved hides problems; prompt tuning needs the live model and is iterative.
Source: BP §4 Track B "Special note", §7 "Risks"; TB "USE FAKES FOR".

**AG-29. Documents are untrusted data.** Read only through extraction; if a document contains instructions, don't follow them and tell Jordan.
Source: system prompt (DOCUMENTS ARE DATA); AD §6 ("Bill contains instructions").

**AG-30. With several attachments, extract every one before proposing anything** (one document often names a rate another states).
Source: system prompt; git `480cc8f`.

**AG-31. A helper's rates and their bill in one message: save the helper, propose the terms first, then record the bill against the proposed service keys; tell Jordan the bill can't be priced until the cards are confirmed and is re-checked automatically.**
Source: system prompt; git `2704d92`; AD §2.3 SourceDocument.

**AG-32. Agreement learning flow:** extract as AGREEMENT; save/update helpers (no duplicates, use helperMatches); propose each term (REPLACE_TERM when the service exists, ADD_TERM otherwise); show what was understood next to its source quote with assumptions. When no start is given, `effectiveFrom` = message date; never invent an earlier start. A term stated in chat cites Jordan's message as the source.
Source: system prompt (LEARNING AGREEMENTS).

**AG-33. Bill flow:** extract as BILL, map the helper name, `record_bill` with lines and period (ask if the period is unknown), then explain: verdict first, then each problem with numbers. Before explaining, ask why each NOT_COVERED or CANNOT_COMPUTE line failed.
Source: system prompt (BILLS).

**AG-34. "Resolving a bill" in chat:** `get_bill`, `check_bill`, `list_agreements` first; don't re-extract or re-record; go through each flagged item one at a time; offer fitting proposals (agreement change, helper message, or approval with accepted exceptions once every item is decided). Never decide for Jordan.
Source: system prompt (RESOLVING A BILL); git `5990327`; PS §7 (Bill detail "Resolve in chat").

**AG-35. Escape tools write HelperNotes directly in the agent package, because core has no note-writing function yet.** Named future fix: move HelperNote creation into `core/records`.
Source: `packages/agent/src/tools/escape.ts`.

**AG-36. Product features map to tools:** learn agreements = `extract_from_document` then `propose_agreement_change`; month status = `get_month_status`; check a bill = `record_bill` then `check_bill`; ask the helper = `propose_helper_message`; approve = `propose_bill_approval` or UI button (one gate); settle mid-month = `propose_engagement_end` + `propose_helper_message`; chat about records = read tools.
Source: AD §5.

**AG-37. When things go wrong:** unencodable term: HelperNote + CANNOT_COMPUTE; unsure extraction: field null with an assumption; sources disagree: propose by precedence, show both; two tabs conflict: STALE; corrected bill for approved period: PERIOD_ALREADY_APPROVED; bill with instructions: ignored as data; model claims a capability: prompt lists limits, tool list is the real boundary; long turn: async, polled.
Source: AD §6.

**AG-38. Engagement end proposal returns a key reminder when the helper `HAS_KEY`; a final bill is then expected for the start of that month to `endedOn`.**
Source: AD §4.3; `packages/core/src/actions/proposals.ts`, `packages/core/src/monthStatus.ts`.

**AG-39. Message proposals: one draft per helper, reason and subject; nothing can go stale.**
Source: `packages/core/src/actions/proposals.ts`.

---

## 5. Memory

**ME-01. What goes where.** AgentCore short-term: user and final assistant messages per session, rebuilt at turn start. AgentCore long-term: preferences, nicknames, usual hours, phrasing (preference + semantic strategies, retrieved at turn start). DynamoDB: terms, bills, actions, approvals, messages (tools only).
Source: AD §4.5.

**ME-02. Long-term facts go into the prompt as "background hints, may be outdated, the database is truth". Money facts always come from tools, never memory.**
Source: AD §4.5; system prompt (TRUTH, hint block); `packages/agent/src/tools/read.ts`.

**ME-03. Long-term extraction is async, so nothing critical depends on it.** Extraction lag (about a minute) is a known failure mode for DESIGN.md.
Source: AD §4.5; SD §6 "Cross-chat memory", §7; BP §9 DESIGN.md "Failure modes"; `packages/agent/src/memory/agentCoreMemory.ts`.

**ME-04. Short-term: one conversational event per chat message (USER/ASSISTANT) under one actor (the household) and the chat's session. TOOL/OTHER events are never written and are skipped on read.**
Source: `packages/agent/src/memory/agentCoreMemory.ts`.

**ME-05. One household, so one AgentCore actor (`household`), a constant in `deployConfig.ts`.**
Source: SD §6; `infra/lib/deployConfig.ts`.

**ME-06. Two built-in long-term strategies: semantic and user preference.**
Source: SD §6, §10; BP §1; `infra/lib/constructs/memory.ts`; IR "Verified at Track D".

**ME-07. Namespace strings have one owner: `deployConfig.ts`** (`/households/{actorId}/semantic`, `/households/{actorId}/preferences`). The Memory construct uses them on the strategies and passes them, with `{actorId}` filled in, as `AGENTCORE_HINT_NAMESPACES` (`SEMANTIC=...,PREFERENCE=...`).
Why: if strategies and hint search drift apart, nothing errors; the agent just never gets hints.
Source: SD §6 "Cross-chat memory"; `infra/lib/deployConfig.ts`, `infra/lib/constructs/memory.ts`.

**ME-08. Fail loudly if memory is unwired: the Lambda wiring (I3) throws on startup if `AGENTCORE_HINT_NAMESPACES` is empty; never quietly fall back to short-term only.** Template test asserts both strategies and both namespaces. Live check at I2/I4: tell it a preference in chat 1, wait ~2 minutes, confirm the hint in chat 2's trace.
Source: SD §6 "Cross-chat memory", §7 "If something fails".

**ME-09. Short-term events expire after 90 days.**
Source: `infra/lib/deployConfig.ts` (`MEMORY_EVENT_EXPIRY_DAYS`).

**ME-10. Hint retrieval: unscored records sort last** (a missing score isn't a low score, but isn't evidence of relevance either).
Source: `packages/agent/src/memory/agentCoreMemory.ts`.

**ME-11. InMemoryMemory fake: history in a Map; hints are whatever is seeded, returned in insertion order, no background extraction or ranking.**
Source: `packages/agent/src/memory/inMemoryMemory.ts`.

**ME-12. Chat history for the UI comes from the MemoryClient, not the Store.**
Source: `packages/api/src/handlers/chat.ts`; SD §4 (`GET /api/sessions/:id/messages` "from AgentCore").

**ME-13. AgentCore IAM actions: `bedrock-agentcore:CreateEvent`, `ListEvents`, `RetrieveMemoryRecords` on the memory ARN** (verified with IAM Access Analyzer `validate-policy`).
Source: IR "Verified at Track D"; SD §6 IAM; BP §10 #6; `infra/lib/constructs/agent.ts`.

**ME-14. Memory construct: `CfnMemory` from `aws-cdk-lib/aws-bedrockagentcore`.**
Source: IR; SD §6; BP §10 #6; TD.

---

## 6. API and auth

**AU-01. Auth option 1: a password chosen at deploy time, checked by the API, which returns a signed, expiring token. Every `/api/*` route except `login` and `health` checks it.**
Why: fewest moving parts (best odds of "deploys first try"); protects data even when the API URL is found directly; fails loudly when `APP_PASSWORD` is missing (no insecure default); upgrade path to Cognito goes in DESIGN.md.
Alternatives: (2) generated password in Secrets Manager (one more command for the reviewer); (3) HTTP Basic Auth in a CloudFront Function (API Gateway URL reachable directly; password in function code); (4) Cognito user pool (largest; more that can break on first deploy); (5) WAF IP allow-list (blocks the reviewers); (6) API key header in the bundle (not real auth).
Source: AD §9; SD §8; BP §1; PS §10.

**AU-02. Protect the data at the API, not just the front door.** The static UI is a shell; the API URL is reachable directly.
Source: AD §9; SD §8.

**AU-03. Token = base64url(expiresAt) + "." + base64url(HMAC-SHA256(APP_PASSWORD, expiresAt)).** Stateless, no separate signing secret, nothing stored server-side. Constant-time comparison. TTL 12 hours. Web Crypto only, so it runs in Node and Lambda.
Source: AD §9; `packages/api/src/auth.ts`; `packages/domain/src/constants.ts` (`AUTH_TOKEN_TTL_HOURS = 12`); `infra/lambda/apiStub.ts` (copy of the format).

**AU-04. Empty password fails loudly at startup** (it would make every login succeed).
Source: `packages/api/src/app.ts`; `infra/scripts/deploy.ts`.

**AU-05. The password is a NoEcho stack parameter (`AppPassword`) passed by the deploy script; it never lands in the template or `cdk.out`, and `cdk destroy` doesn't need it. It still sits in the API Lambda's env vars** (accepted for a take-home).
Source: IR "Choices worth knowing"; SD §6 Settings; AD §9.

**AU-06. No login rate limiting / lockout.**
Why: not stated in any doc. No source found in the repo for this decision; it's implied by the simple auth choice (AU-01). Listed because the author named it.
Source: none found (author's list).

**AU-07. Token is held in memory only in the UI and sent as `Authorization: Bearer`. A 401 on an authenticated route drops it and returns to Login.**
Source: SD §3 Login; AD §9; `apps/web/src/api/client.ts`.

**AU-08. The API contract is written once as zod schemas in `packages/domain` (`api/routes.ts`) and used by UI, API and mock.**
Source: SD §4; BP §2 "Shared contracts".

**AU-09. One validation boundary in the API: params, query and body are parsed with the route's zod schemas; handlers and core trust them. The handler table is typed one-per-route, so a missing handler is a compile error.**
Source: `packages/api/src/routing.ts`; TA.

**AU-10. `createApp(deps)` is runtime-agnostic (Hono, Web APIs only): served by Node locally and wrapped with `hono/aws-lambda` on Lambda. No environment reads inside the API.**
Source: BP §2; `packages/api/src/app.ts`, `packages/api/src/deps.ts`.

**AU-11. Confirm is THE commit. No model call anywhere on the confirm path.** `applyAction` re-reads the basis; if it moved, STALE; otherwise the conditional writes commit atomically with the CONFIRMED action.
Source: SD §2, §3 Confirm; AD §4.6; `packages/core/src/actions/apply.ts`, `resolve.ts`; `packages/api/src/handlers/commits.ts`.

**AU-12. A STALE outcome is a 200 with `action.status = STALE`, not an error.** Confirm and reject send the `actionVersion` the user saw; confirm may carry an edited `messageBody`.
Source: SD §4; TA; `packages/api/src/handlers/commits.ts`; `apps/web/src/screens/decisions/ActionCard.tsx`.

**AU-13. One gate for every entry point: the UI Approve button = propose `BILL_APPROVAL` + confirm in one request, same function as the chat path.**
Source: SD §3 "UI Approve button"; AD §4.6; `packages/core/src/records/bills.ts` (`approveBill`).

**AU-14. Approval apply:** re-run `checkBill`; if it differs from the snapshot, STALE; conditional write requires `status = RECEIVED` and the same version; write the sealed Approval; after this, no code path edits the bill. Every blocking item must be accepted as an exception with a reason, or there is nothing to propose.
Source: AD §4.6; `packages/core/src/actions/proposals.ts`, `apply.ts`.

**AU-15. There is deliberately no route that edits a bill.** The Store refuses any write to an approved bill.
Source: `packages/api/src/handlers/commits.ts`; SD §5.

**AU-16. Conflicts: detect on propose (same `targetKey` pending actions returned as NEEDS_DECISION), enforce on confirm (basis moved: STALE), explain by model.** Other pending actions on the same target are left alone; confirming one later finds its basis moved.
Source: AD §4.6; `packages/core/src/actions/pipeline.ts`, `resolve.ts`.

**AU-17. Error to HTTP mapping as tables. `StoreCommitError` maps to 409; too-many-ops is our bug, not the caller's.**
Source: `packages/api/src/errors.ts`; TA.

**AU-18. `POST /api/chat` only takes the session lock, creates the Turn and calls `TurnRunner.start`; UI polls `GET /api/turns/:id` (~1 s).** If dispatch throws, the turn is marked FAILED and the lock released.
Source: SD §2, §3; TA; `packages/core/src/records/sessions.ts`; `packages/domain/src/constants.ts` (`TURN_POLL_INTERVAL_MS`).

**AU-19. Uploads are base64 in JSON, one request.** Lambda payload limit is 6 MB, so `UPLOAD_MAX_BASE64_CHARS = 4,000,000`; text uploads capped at 200,000 chars to stay well inside a DynamoDB item.
Source: SD §3 Upload; `packages/domain/src/constants.ts`; `packages/api/src/handlers/documents.ts`.

**AU-20. API surface** (login, health, chat, turns, sessions, documents, helpers incl. direct create/edit, terms, bills, month-status, actions, confirm, reject, approve, payment, messages, handed-off).
Source: SD §4.

**AU-21. Payment route only for an APPROVED bill, one per bill.**
Source: TA "ALSO"; `packages/core/src/records/bills.ts`.

---

## 7. UI

**UI-01. React (Vite), hand-rolled hash routing (`#/month`).**
Why: CloudFront SPA fallback would rewrite API 404s into `index.html`; with hash routing no fallback is needed.
Source: SD §6 "Gotchas", §10; BP §1; `apps/web/src/app/routes.ts`; `infra/lib/constructs/web.ts`.

**UI-02. Typed API client derived from `apiRoutes`; every response parsed with the route's schema. That is the UI's one validation boundary.**
Source: TC; `apps/web/src/api/client.ts`, `apps/web/src/api/routeTypes.ts`.

**UI-03. The UI never computes verdicts or statuses; it renders what the API returns.** `checkItems` only sorts what the check says, using domain severity tables.
Source: TC; `apps/web/src/ui/checkItems.ts`.

**UI-04. `billedCentsOf` is mirrored in the UI** because core stays out of the production bundle.
Source: `apps/web/src/ui/billAmounts.ts`. (Duplicated logic with `packages/core/src/records/billAmounts.ts`.)

**UI-05. Mock transport for development, built from fixtures, with a scenario switcher (`empty`, `month-mixed`, `bill-flagged`, `pending-conflict`, `approved`, `helper-ended`). Imported only behind `import.meta.env.DEV`, so it's never bundled. The mock is the only code that imports fixtures; it accepts any password except one wrong-password case.**
Source: BP §4 Track C; TC; `apps/web/src/main.tsx`; git `6ddfc84`.

**UI-06. `dev:local` mode talks to `apps/local-server` through the Vite proxy.**
Source: BP §5 "Running I1 locally"; `apps/web/src/devModes.ts`.

**UI-07. Screens:** Login (one password); Home; Bill detail; Agreements; Assistant chat; Decisions badge ("3 things need you").
Source: PS §7.

**UI-08. Month and Bills merged into one Home screen** (changed 2026-10-16).
Why: "has the bill come?" and "which bills are there?" are the same question. Home shows two small charts, the status of every helper's bill, every bill for the month (approved, paid, replaced) with Mark as paid; the assistant fills the right side; the page fits the window and each card scrolls.
Source: PS §7 "Changed 2026-10-16"; git `480cc8f`, `5990327`; `apps/web/src/screens/month/HomeScreen.tsx`, `MonthBills.tsx`. See C-04.

**UI-09. Charts: one series each (one hue, no legend), bars labeled with values, agreed amount as text ("can't tell" when the checker couldn't work it out); replaced bills don't count.**
Source: `apps/web/src/screens/month/MonthCharts.tsx`.

**UI-10. Month row view is a table: per derived state, status text, tone, whether it counts toward "Waiting on you", and the button.**
Source: `apps/web/src/screens/month/monthRowView.ts`.

**UI-11. Bill detail:** verdict and reasons up top (readable in five seconds), source beside line-by-line check. Actions: Approve when it checks out; otherwise "Resolve in chat" first, "Ask {helper}", and a quiet "Approve anyway...". Approved bills render locked with no edit controls. Lines that need a decision start open. The bill screen notes agreement changes still waiting.
Source: PS §7, §8; BP §4 Track C; `apps/web/src/screens/bill/BillScreen.tsx`, `BillHeadline.tsx`, `LineChecksTable.tsx`; git `2704d92`.

**UI-12. "Resolve in chat" starts a new chat seeded with the bill id and every flagged item.**
Source: PS §7; git `5990327`; `apps/web/src/app/chatActions.ts`.

**UI-13. Approve dialog:** who, how to pay, how much, accepted exceptions with reasons. "Approve anyway..." is the same dialog; every item needing a decision needs a reason. Amount = sum of lines; stated total shown as "billed" when different.
Source: PS §4.6; `apps/web/src/screens/bill/ApproveDialog.tsx`.

**UI-14. Agreements:** per helper, editable details (key, how to pay, contact), terms in effect or upcoming, past terms behind "Show past agreements", notes; prices as a table (charge, amount, when it applies); assumptions folded behind "Show assumptions"; source one click away; each assumption has a one-click way to correct it through the assistant.
Source: PS §7; git `5990327`, `52ec183`; `apps/web/src/screens/agreements/`, `apps/web/src/ui/PricingTable.tsx`.

**UI-15. Helper profile form saves directly with the version edited (a concurrent change comes back as a conflict). A new helper starts with every unknown fact marked unknown.**
Source: `apps/web/src/screens/agreements/HelperProfileForm.tsx`; PS P14.

**UI-16. Assistant chat:** paste text, attach files or a whole folder (images, text files, PDFs), or drop them in. Pending cards inline; decided cards fold into a read-only "Approved in this chat" side panel; chat list on the other side.
Source: PS §7; git `480cc8f`; `apps/web/src/screens/chat/`.

**UI-17. Unsent drafts kept per chat until sent: text in localStorage (survives reload), attachments in memory only (file contents can exceed localStorage).**
Source: `apps/web/src/screens/chat/drafts.ts`; PS §7.

**UI-18. File intake: images resized (longest edge 1500 px, re-encoded JPEG), text files read as text, PDFs sent as-is; unsupported files listed with the reason, never silently dropped. Per-file kind dropdown removed: kind is format only.**
Why (resize): keeps requests under the Lambda payload limit and within model image limits.
Source: SD §3 Upload; `apps/web/src/lib/fileIntake.ts`, `apps/web/src/lib/resizeImage.ts`; git `2704d92`.

**UI-19. Assistant replies render a small Markdown subset as React elements, never raw HTML, so a message can't inject markup.**
Source: PS §7; git `52ec183`; `apps/web/src/ui/Markdown.tsx`.

**UI-20. File-only chats are titled by their files ("02-priya-rates.png and 7 more").**
Source: git `52ec183`; `packages/core/src/records/sessions.ts`.

**UI-21. Decisions screen: pending cards grouped by `targetKey` (conflicts shown together so Jordan picks one), messages ready to send, recently resolved.**
Source: AD §4.6; `apps/web/src/screens/decisions/`.

**UI-22. Messages: copy, or open in Messages/Mail (link with text filled in), then "I sent it".**
Source: PS §4.5; `apps/web/src/screens/decisions/MessageList.tsx`.

**UI-23. Mark as paid form: date, method, optional note; date starts empty (we don't guess when Jordan paid); UNKNOWN isn't a way to pay.**
Source: `apps/web/src/screens/month/MarkPaidForm.tsx`.

**UI-24. Plain words for every domain code as lookup tables keyed by the enums; a new enum member fails typecheck until it has a label.**
Source: PS §8; `apps/web/src/ui/labels.ts`, `apps/web/src/ui/rules.ts`.

**UI-25. LocalDates are formatted in UTC so a date never shifts with the viewer's time zone; system timestamps use the viewer's local time.**
Source: `apps/web/src/ui/format.ts`, `apps/web/src/lib/dates.ts`.

**UI-26. After any mutation a refresh epoch reloads every mounted query, so badge, Home and detail views never show stale state.**
Source: `apps/web/src/app/AppContext.tsx`.

**UI-27. An error boundary around the routed screen keeps a rendering bug from blanking the app.**
Source: `apps/web/src/ui/ErrorBoundary.tsx`.

**UI-28. Look and feel: warm, calm "home ledger".** Linen background, warm-white panels with soft borders, sage accent, terracotta house mark; Fraunces headings, Nunito Sans text; every area is a titled panel; Home and Assistant fill the window and scroll inside their panels. Home first run shows a welcome with three steps.
Source: PS §7; git `52ec183`.

**UI-29. Same origin `/api` through CloudFront: no CORS.**
Source: SD §2; `apps/web/src/api/transport.ts`.

---

## 8. Infra and deploy

**IN-01. AWS CDK in TypeScript, one stack (`HelperAssistant`), grouped into constructs: Data, Memory, Agent, Api, Web, plus stack outputs.**
Source: SD §6, §10; `infra/lib/helper-assistant-stack.ts`.

**IN-02. Two Lambdas (API and Agent), async turns with polling.**
Why: an agent turn is several model calls and takes 10 to 60 s; HTTP API cuts requests at about 30 s. The API Lambda is the only thing that commits changes, so confirmations never touch the model.
Source: SD §2, §10.

**IN-03. DynamoDB, one table per entity, keyed by the entity's own id, GSIs for lists; no household key (one household).** (12 tables.)
Why: each table holds one kind of thing and reads like any other database. Cost: ~12 tables in CDK, no extra charge on-demand. Only `DynamoStore` knows about tables.
Alternatives: single table with prefixed sort keys (fewer resources, harder to read; the earlier design); Aurora (needs a VPC, slower to deploy).
History: git `0095895` "change from single table to regular multi dynamo tables".
Source: SD §5, §10; `infra/lib/tableSpecs.ts`.

**IN-04. Concurrency via DynamoDB features:** version check on confirm (`ConditionExpression`); approved immutability (every bill write carries `attribute_not_exists(billId) OR #status <> :approved`); one turn per session (conditional update of `activeTurnId`); short action refs (atomic `ADD` on Counters); confirm writes across tables with `TransactWriteItems`.
Source: SD §5, §11.

**IN-05. Cross-table transactions limit: 100 items (`STORE_MAX_OPS_PER_COMMIT = 100`). InMemoryStore enforces it too so fakes don't hide it.** A term change touching more than ~98 open bills would fail; can't happen for one household; named future fix.
Source: SD §11; `packages/domain/src/constants.ts`.

**IN-06. GSI reads are eventually consistent; accepted.** Conflict detection on propose may miss a proposal made a split second earlier; the real guard is the version check at confirm. Lists right after a write may lag; the UI reloads.
Source: SD §11.

**IN-07. Helpers and Sessions are listed with a full Scan** (a few rows). A multi-household version would add a `householdId` key and GSI.
Source: SD §5, §11.

**IN-08. `periodMonth` is a stored copy of `period.start[0:7]`, written only so the `byMonth` index has a key.**
Source: SD §5.

**IN-09. CloudFront + S3 serves the app and proxies `/api/*`: one URL, no CORS.** Origin request policy `AllViewerExceptHostHeader` (forwarding Host makes API Gateway 403). No SPA fallback.
Source: SD §2, §6 Gotchas; `infra/lib/constructs/web.ts`.

**IN-10. Region and model are pinned (hardcoded) in `infra/lib/deployConfig.ts`: `us-east-1`, `us.anthropic.claude-sonnet-4-6`; the README repeats them. The account is never hardcoded (`CDK_DEFAULT_ACCOUNT`). No `cdk.json` context.**
Why: AgentCore Memory and the Claude profile both have to exist in the deploy region; pinning a tested region removes a class of first-deploy failures and the need for a region-to-prefix lookup. A profile with no region or a different region still deploys to the right place.
Trade-off (for DESIGN.md): the brief says "nothing hardcoded to your account or region"; read as "must deploy into the reviewer's account without edits". Another region is a one-line change if the model profile prefix and AgentCore support match.
History: git `7697498` ("Pin deploy region and model").
Source: SD §6 Settings, §10; BP §10 #5; TD; IR "Pinned settings"; `infra/bin/app.ts`.

**IN-11. IAM: grant `InvokeModel` on the inference profile ARN and on the foundation model ARN in any region** (`arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6`).
Why: the US cross-region profile routes to `us-east-1`, `us-east-2`, `us-west-2`.
Source: SD §6 Gotchas and IAM; IR "Verified at Track D"; `infra/lib/constructs/agent.ts`.

**IN-12. Least-privilege IAM.** API Lambda: tables, uploads bucket read/write, invoke Agent Lambda. Agent Lambda: tables, read uploads, `bedrock:InvokeModel`, the three AgentCore actions on the memory ARN.
Source: SD §6 IAM.

**IN-13. The deploy script runs `cdk bootstrap` every time, before `cdk deploy --require-approval never`.**
Why: the reviewer never has to know about bootstrap. Safe: never bootstrapped creates CDKToolkit; already bootstrapped is a no-op; older version upgrades in place without breaking other CDK apps. Exception: custom-qualifier or org-managed bootstrap; README says to bootstrap their way and run `npx cdk deploy`.
Source: SD §1, §7, §10; TD; git `7697498`, `fd49081`; `infra/scripts/deploy.ts`.

**IN-14. Deploy builds the React app first, and fails before touching AWS if `APP_PASSWORD` is unset.**
Source: SD §6 Gotchas, §7; `infra/scripts/deploy.ts`.

**IN-15. Destroy removes everything the app created: `cdk destroy --force`, then a cleanup script deletes leftover log groups starting with `/aws/lambda/HelperAssistant-` or `HelperAssistant-`.** Tables and both buckets (emptied first, `DESTROY` + `autoDeleteObjects`), Lambdas, HTTP API, CloudFront, the memory resource and its events, our log groups.
Why (cleanup): CDK's internal helper Lambdas create log groups the stack can't declare; the UI BucketDeployment Lambda logs during teardown after its group is gone, so Lambda re-creates it (seen on the first real teardown). Both prefixes start with the stack name, so nothing outside this app matches.
Source: SD §6 Gotchas, §7 Teardown, §10; TD; git `7697498`, `fd49081`; `infra/scripts/destroy.ts`, `infra/scripts/cleanupLogGroups.ts`. See C-03.

**IN-16. `CDKToolkit` is kept on destroy.**
Why: shared by every CDK app in that account and region; deleting it could break the reviewer's other apps. README gives the one manual command for a fully clean account.
Source: SD §1, §7 Teardown, §10.

**IN-17. Our Lambdas get explicit `LogGroup` resources with `DESTROY`; `BucketDeployment` gets its `logGroup` prop.**
Source: SD §6 Gotchas; TD; `infra/lib/constructs/nodeFunction.ts`.

**IN-18. Lambdas are `NodejsFunction` with esbuild on the host (no Docker), Node 22 on arm64.**
Source: SD §6 Gotchas; `infra/lib/constructs/nodeFunction.ts`.

**IN-19. Agent Lambda: 5-minute timeout, async `retryAttempts: 0`, plus a turn-status guard.**
Why: async invokes retry by default, so a turn could run twice.
Source: SD §6 Construct table and Gotchas; `infra/lib/constructs/agent.ts`.

**IN-20. Table names are generated by CloudFormation and passed to both Lambdas as `TABLE_*` env vars; these strings are the contract for `DynamoStore`.**
Source: IR "Choices worth knowing"; `infra/lib/tableSpecs.ts`, `infra/lib/constructs/data.ts`.

**IN-21. Lambda handler entries are construct props; the `lambda/*Stub.ts` files are temporary.** At I3, point the entries at thin wrappers around `createApp` and `runTurn`, then delete the stubs. Infra stubs use Node built-ins only; infra doesn't depend on the app packages (token TTL copied).
Source: IR; TD; `infra/lib/paths.ts`, `infra/lambda/apiStub.ts`, `infra/lambda/agentStub.ts`.

**IN-22. "Today" is the runtime's clock. No `HOUSEHOLD_TIME_ZONE` setting.** Locally the laptop's zone; on Lambda UTC (Lambda reserves `TZ`).
Consequence: deployed, "today" flips at midnight UTC (5 to 8 pm on US coasts), affecting month status and "the 15th"-style resolution near month boundaries. Bill and agreement dates are household-local strings, never shifted.
History: git `7697498` ("drop household time zone").
Source: SD §6 "Time", §10; BP §9 DESIGN.md "Failure modes" and "Left out", §10 #7; TD #7; `packages/domain/src/clock.ts`.

**IN-23. Uploads bucket is private, no public access, served only via the API. No public Lambda function URLs.**
Source: SD §8; `infra/lib/constructs/data.ts`.

**IN-24. Stack outputs: `AppUrl`, `Region`, `ModelId`, `MemoryId`, login hint.**
Source: SD §6.

**IN-25. Cost: no always-on items (no VPC, NAT or instances); model tokens are the main cost. Guardrail: an AWS budget alert; tear down when done.**
Source: SD §8.

**IN-26. Observability: Lambda log groups declared in CDK; a per-turn trace on the `Turn` item (model calls, tool calls with inputs and results, tokens, errors); `latestCheck` stored on the bill; one structured log line per tool call with `turnId` and `sessionId`.**
Source: SD §9; `packages/agent/src/model/tracedModel.ts`.

**IN-27. Approved dependency for Track D: `@aws-sdk/client-cloudwatch-logs` (devDependency) for the cleanup script. Nothing else.**
Source: TD.

**IN-28. First failed deploy leaves `ROLLBACK_COMPLETE`: run `npm run destroy` before retrying.**
Source: SD §6 Gotchas.

**IN-29. Enabling the model is a one-time manual step: Bedrock console in `us-east-1`, Claude Sonnet 4.6 (and the Anthropic use-case form if the account has never used Claude).**
Source: SD §7; BP §9 README.

**IN-30. Local server: in-memory store, blob store and memory; LocalTurnRunner in-process; system clock; model by `MODEL_PROVIDER`; settings from repo-root `.env` plus the real environment (which wins); missing required settings fail before start; nothing has a default; everything resets on restart. `LOCAL_SEED`: `empty`, `documents`, `full`.**
Source: BP §5 "Running I1 locally"; `apps/local-server/src/config.ts`, `index.ts`, `seed.ts`; `.env.example`; git `09b77c0`.

---

## 9. Process

**PC-01. Four planning docs, each answering one question:** product spec (what), system design (what runs where), agent design (shape of agent, data, code), build plan (order, split, testing). Plus a side checklist `saad_aws_cli_setup.md`.
Source: PS header; BP header.

**PC-02. Split by seam (strategy C): freeze contracts, then four tracks against fakes.**
Why: each track verified alone; swapping fakes for real is mechanical; ~2 hours of contract work upfront. Refines the author's "UI + agent locally while I do infra" by splitting UI and agent, and carving out the rules engine (pure code, highest value).
Alternatives: A. by layer (UI + agent vs infra; big coupled lump, surprises at the end); B. by vertical slice (agreements / bill check / messaging; constant merge conflicts on shared model, UI shell, infra).
Source: BP §3.

**PC-03. Track 0 first, sequential: workspaces, tsconfig, eslint (max-lines 450), vitest, domain schemas, API contract, interfaces, in-memory fakes, clocks, fixtures, empty packages, all dependencies installed up front.**
Source: BP §3 Track 0.

**PC-04. After Track 0, `packages/domain` is frozen; changes go through the author.**
Why: contract drift is the number one way parallel work fails.
Source: BP §3, §7 Risks; every track brief.

**PC-05. One owner per directory; each track in its own git worktree and branch. No new npm dependencies without asking (the lockfile is shared).**
Source: BP §3; track briefs.

**PC-06. Track brief template:** TRACK, GOAL, READ (exact §s), IMPLEMENT, OWN, DO NOT TOUCH, USE FAKES FOR, DONE WHEN, OUT OF SCOPE.
Source: BP §3.

**PC-07. Seams, each with a fake and a real:** Store (InMemoryStore / DynamoStore), ModelClient (FakeModel / BedrockModel, plus AnthropicModel locally), MemoryClient (InMemoryMemory / AgentCoreMemory), TurnRunner (LocalTurnRunner / LambdaTurnRunner), Clock (FixedClock / SystemClock), BlobStore (InMemoryBlobStore / S3BlobStore, added in Track 0).
Rule: all logic lives in `createApp(deps)`; Lambda handlers are ~10 lines of glue.
Source: BP §2.

**PC-08. Clock implementations live with the Clock port in domain** (tiny and used by every package).
Source: `packages/domain/src/clock.ts`.

**PC-09. Integration in four gates, each isolating one risk:** I1 all local (do the pieces fit?), I2 real AWS data (do AWS services behave as assumed?), I3 Lambdas (packaging, IAM, timeouts, async?), I4 hardening (works for strangers first try?).
Why I2 before I3: if I3 breaks with nothing else swapped, the problem is packaging or IAM.
Source: BP §5.

**PC-10. Merge order: Track 0, then A/B/C/D in any order, then I1 to I4.**
Source: BP §5.

**PC-11. Track D first and redeploy often.** Infra surprises cost hours; D deploys a skeleton and redeploys at every gate.
Source: BP §4 Track D, §7 Risks.

**PC-12. "Verify by eye" lists per track; green tests aren't enough.**
Source: BP §4.

**PC-13. Testing layers:** checker (answer key), state machine, store conformance (same suite on InMemoryStore and DynamoStore), API, tools, loop (FakeModel), extraction (golden, live model, 3x), behavior (trace assertions: never reaches commit), adversarial, UI, deploy.
Source: BP §6.1.

**PC-14. Store conformance suite is a function taking a store factory, reused at I2 for DynamoStore.**
Source: TA; `packages/store/test/storeConformance.ts`.

**PC-15. Track C mock answers every route per scenario; scenario data the fixtures don't have is built in the mock folder with explicit values, not invented defaults.**
Source: TC.

**PC-16. Track B codes against its own port for core and swaps in A's real exports at I1; never reimplements checker logic.**
Source: TB.

**PC-17. What not to parallelize:** Track 0, prompt tuning, integration gates, DESIGN.md.
Source: BP §7.

**PC-18. Risks and mitigations:** contract drift (frozen domain); fakes too forgiving (real model early, conformance on real stores); duplicated helpers across tracks (one owner per directory, shared code only in domain); reviewer overload (verify-by-eye lists); late infra surprises (skeleton first).
Source: BP §7.

**PC-19. Timeline: about 2 days, gates staggered.**
Source: BP §7.

**PC-20. Brief requirements mapped to where they're met and how verified.**
Source: BP §8.

**PC-21. README and DESIGN.md contents planned** (README: prerequisites incl. model enabled in region, deploy, login, teardown, model ID and region with why pinned. DESIGN.md: key decisions, remembers vs records, disagreement handling, failure modes, left out, assumptions log, future fixes).
Source: BP §9; AD §7 ("Future fixes" list).

**PC-22. Keep docs alive; only the `_latest` docs are kept, updated in place.** Older `_v1`/`_v2` copies were made during changes and later removed.
Source: BP §11; git `41f933b` ("Remove old doc versions; keep only the _latest docs"); git `7697498`, `480cc8f`, `5990327` (created `_v1`/`_v2` copies). See C-10.

**PC-23. Code principles applied:** domain explicit in data (enums); shared behavior, distinct data (one checkBill, one PendingAction pipeline, one applyAction); never turn unknown into "probably" (UNKNOWN, null + assumption, CANNOT_COMPUTE); tables over branching; naming carries meaning (`houseKeyAccess`, `authorizationClaim`, `HANDED_OFF`); validate once at the boundary; short files (≤ 400 lines; constants in domain); docstrings name call sites; deferred problems named.
Source: AD §7. See C-09 on file length.

**PC-24. Every core export has a docstring naming its call sites.**
Source: TA; `packages/core/src/index.ts`.

**PC-25. Validation boundaries:** API routes (requests), extraction output, tool input (`dispatchTool`), UI client (responses). Core trusts its input; `CoreError` covers only preconditions that need stored state.
Source: AD §7; `packages/core/src/errors.ts`; `packages/api/src/routing.ts`; `packages/agent/src/tools/registry.ts`; `apps/web/src/api/client.ts`.

---

## 10. Assumptions log (starter pack)

| # | Assumption | Why | Source |
|---|---|---|---|
| 1 | "the 15th" in an Aug 28 message means Sep 15 | Next 15th after the message | BP §9 |
| 2 | Screenshot dates are 2026 | Weekdays match 2026 | BP §9 |
| 3 | "late rate" = Priya's $28/hr | The only after-hours rate she gave | BP §9; AD §3.4; PS §4.4 |
| 4 | Sunday ×1.5 applies to the base $22 | Most natural reading | BP §9, §6.3 |
| 5 | Newer, direct message beats older typed notes (still confirmed by Jordan) | Source precedence | BP §9 |
| 6 | A claim ("Sam said it's fine") isn't an agreement | Needs Jordan's explicit acceptance | BP §9 |
| 7 | Line items are the source of truth over a stated total | Totals are derived | BP §9 |
| 8 | A corrected bill supersedes an earlier unapproved bill | Natural result of "ask the helper" | BP §9 |
| 9 | One user, one household. Whoever logs in decides | Out of scope per brief | BP §9 |

Related: the data traps the tests target (Theo $25 notes vs $28 text; "the 15th" with no month; "Wed, Jan 14" with no year; "my late rate"; Sunday time and a half; 7pm to 12am; total ≠ sum; fee with "Sam said"; Lupe's key in notes only). Source: BP §6.3.

---

## 11. Deferred problems and named future fixes

| # | Deferred item | Source |
|---|---|---|
| F-01 | "Adjustment bill" for an already-approved period (today: handled outside the app) | PS §5 S1 |
| F-02 | Move to a Sonnet 5.x model: drop forced tool choice and temperature, carry thinking blocks through the loop | SD §6 |
| F-03 | Transactions over 100 items (a term change touching > ~98 open bills) | SD §11 |
| F-04 | Multi-household: add `householdId` key and GSIs instead of Scans | SD §11 |
| F-05 | Cognito as the auth upgrade path | AD §9; BP §9 |
| F-06 | Move HelperNote creation from the agent's escape tools into `core/records` | `packages/agent/src/tools/escape.ts` |
| F-07 | Give starter-pack seeding one shared home (duplicated in `apps/local-server/src/seed.ts` and `packages/agent/scripts/live/seed.ts`) once a third caller appears, e.g. the I2 DynamoStore loader | `apps/local-server/src/seed.ts` |
| F-08 | Visit log (option C), which would enable "what do I owe so far?" for settlement | PS §6 |
| F-09 | Scheduled monthly run (EventBridge Scheduler) | PS §5 P4 |
| F-10 | Real message sending as a new `deliveryMode` | AD §2.3 OutboundMessage |
| F-11 | Holiday calendar (none today; weekday holidays count as scheduled days) | `packages/core/src/checker/plausibility.ts`; AD §10 C9 |
| F-12 | Household time zone (dropped; "today" is UTC on Lambda) | SD §6; BP §10 #7 |
| F-13 | Add new rule kinds when similar HelperNotes pile up | AD §2.3 HelperNote |
| F-14 | Explicit "open start" for terms (passed on in favor of "earliest covers the past") | AD §2.3 AgreementTerm |
| F-15 | Lambda stubs replaced and deleted at I3; `AgentCoreMemory` not yet verified against a deployed memory (I2) | IR; `infra/lambda/*Stub.ts`; `packages/agent/src/memory/agentCoreMemory.ts` |
| F-16 | Auto-pay clean bills under a cap; read an inbox (what a real product would do) | PS §2 |

---

## Conflicts and duplicates

Places where sources disagree, or say the same thing in more than one place. Not resolved here.

**C-01. Theo's expected weekday count: 21 vs 22.**
PS §6 says "September has 21 weekdays after Labor Day" and the example note says "21 weekdays excluding Labor Day". AD §10 C9, BP §6.2 and `packages/core/src/checker/plausibility.ts` say 22, because there's no holiday calendar.

**C-02. Is the Claude API used only locally, or also by the deployed app?**
BP §5 ("The deployed Lambdas only use Bedrock, which the brief requires"), the `anthropicModel.ts` docstring and `.env.example` ("Nothing here is used by the deployed stack") say local only. SD §2 (architecture), AD §4 and BP §1 describe only Bedrock. The author's own summary of decisions frames the Claude API swap as the working path while Bedrock is blocked. If the deployed stack now also supports `MODEL_PROVIDER`, these sources need updating.

**C-03. Log group cleanup prefixes.**
TD says the destroy script deletes log groups starting with `/aws/lambda/HelperAssistant-` only. SD §6/§7 and `infra/scripts/cleanupLogGroups.ts` delete both `/aws/lambda/HelperAssistant-*` and `HelperAssistant-*`. TD is older.

**C-04. A separate Bills screen vs one Home screen.**
TC "ALSO" asks for a Bills list by month and calls the Month screen "home". PS §7 (changed 2026-10-16) merged Month and Bills into one Home screen. TC is older.

**C-05. CLI model settings.**
TB "DONE WHEN" says the CLI needs "AWS creds + model ID from env", and git `1e5ecec` says live scripts "need BEDROCK_MODEL_ID and AWS_REGION". Since git `09b77c0` they need `MODEL_PROVIDER` plus that provider's settings.

**C-06. How a corrected bill for an approved period behaves.**
AD §6 says "Flagged `PERIOD_ALREADY_APPROVED`. Not applied" and BP §6.4 says "`PERIOD_ALREADY_APPROVED`, not applied". PS §5 S1 and `packages/core/src/records/bills.ts` are more specific: an exact same-period bill is refused (not saved); a bill that only overlaps is saved, with the finding.

**C-07. "Hand-rolled loop on the Bedrock Converse API" vs two providers.**
PS §10, AD §4 and BP §1 say Converse. The loop now also runs on the Claude Messages API through `AnthropicModel`. The domain `ModelRequest` still mirrors Converse.

**C-08. "Five seams" heading vs six seams.**
BP §2 is headed "The five seams" but its table lists six (BlobStore was added in Track 0).

**C-09. Model ID and region: "read from env" vs "pinned".**
TB "OUT OF SCOPE" says not to hardcode a model ID or region (read from env). SD §6, TD and `infra/lib/deployConfig.ts` pin them. Probably compatible (the agent package reads them from its caller; infra pins what it passes), but the wording differs.

**C-10. Keeping old doc versions.**
BP §11 and git `41f933b` keep only `_latest` docs. The author's global working rules ask for older versions to be kept (`_v1`, `_v2`) for traceability. Git `7697498`, `480cc8f` and `5990327` had created those copies before they were removed.

**C-11. File length limit.**
AD §7 says files ≤ 400 lines. Eslint is configured with max-lines 450 (BP §3 Track 0; TA). The author's global rules say 400 to 500.

**C-12. Priya's late rate start time in the system prompt.**
`packages/agent/src/prompt/systemPrompt.ts` uses the example "Priya's 'my late rate' for date nights = her $28/hr after 11pm from her rates screenshot". The answer key (BP §6.2) says Priya's rate is "$22/hr. After 10pm $28/hr" and date night is "flat $100 until 11pm, then late rate". The $28 is the same; "after 11pm" describes the date-night overage, while the rates screenshot's late rate starts at 10pm. Worth checking the wording.

**C-13. Track D "still open" vs verified.**
TD lists "the exact AgentCore IAM action names" as still open; IR, SD §6 and BP §10 #6 record them as verified.

**C-14. Month status scope.**
PS §4.2 says status is shown "for each active helper". AD §2.3 BillingPeriodStatus and `packages/core/src/monthStatus.ts` include just-ended helpers (they owe a FINAL_SETTLEMENT bill). Not contradictory with PS §4.7, but PS §4.2 is narrower.

**C-15. No login rate limiting.**
Listed by the author as a decision; no doc, code comment or commit in the repo states it (AU-06).

**C-16. Duplicated logic acknowledged in code.**
`billedCentsOf` is mirrored in `apps/web/src/ui/billAmounts.ts` (core stays out of the bundle). Starter-pack seeding is duplicated (F-07). The token format and TTL are copied into `infra/lambda/apiStub.ts` (temporary, infra doesn't depend on app packages).

**Duplicates (same decision stated in several places, consistent):**
- Approve anyway with exceptions: PS P9, AD §8 A1, BP §10 #1.
- Plausibility notes: PS P11 and §6, AD §8 A2, BP §10 #2.
- Supersede rule: PS P10, AD §4.3 and §8 A3, BP §10 #3, `bills.ts`.
- `record_bill` without confirmation: AD §8 A4 and §10 C17, BP §10 #4, TA, `record.ts`.
- Profile saves ungated: PS P14, AD §10 C5, TA/TB/TC, `helpers.ts`, `HelperProfileForm.tsx`.
- Sum of lines approved: PS P15, AD §10 C18, BP §9 #7, `billAmounts.ts`, `ApproveDialog.tsx`, system prompt.
- Pinned region and model: SD §6 and §10, BP §10 #5 and §9, TD, IR, `deployConfig.ts`.
- No household time zone: SD §6 and §10, BP §10 #7, TD #7, `clock.ts`.
- Bootstrap on every deploy and teardown scope: SD §1, §7, §10; TD; `deploy.ts`, `destroy.ts`.
- Decisions-locked tables: PS §10, SD §10, BP §1 repeat the stack choices (TypeScript, React/Vite, npm, CDK, auth option 1, no scheduler, drafted messages).
