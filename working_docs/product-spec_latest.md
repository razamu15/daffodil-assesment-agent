# Product Spec & Decisions

Written for: Saad. Doc 1 of 4 in the build set. Same teaching tone as our chat.

| Doc | Question it answers |
|---|---|
| **1. Product spec** (this one) | *What does the product do, and what doesn't it?* |
| 2. `system-design_latest.md` | *What runs where on AWS, and how do I deploy it?* |
| 3. `agent-design_latest.md` | *How is the agent, the data model, and the code shaped?* |
| 4. `build-plan_latest.md` | *In what order do I build and test it, and how do I parallelize?* |

Items marked **[DECIDE]** need your call. Everything else is a recommendation or a decision you already made.

---

## 1. The product in one paragraph

The assistant reads what Jordan has, keeps a **record of what was agreed** with each helper, **checks every bill** against that record, and says plainly: *"this checks out"* or *"these things are off."* It helps Jordan ask the helper about problems. Jordan approves and pays.

> **The assistant checks, explains, and drafts. It never moves money and never sends messages on its own.**

That sentence is the product. Everything below follows from it.

---

## 2. The line: what it does and doesn't do

You asked for a clear statement of this. Here it is.

| The assistant DOES | The assistant DOES NOT | Why not | A real product would |
|---|---|---|---|
| Learn agreements from notes, threads, screenshots | Save them without Jordan's confirmation | Brief: terms need explicit confirmation | Same |
| Show which bills have arrived and which haven't | Receive bills by itself (email/SMS) | Out of scope. Jordan pastes or uploads | Read an inbox |
| Check each bill against the agreements | Pay anyone | No Venmo/Zelle access in this test | Auto-pay clean bills under a cap |
| Flag discrepancies in plain words | Decide for Jordan | Money decisions are Jordan's | Same |
| Draft a message to the helper (discrepancy, missing bill) | Send the message itself | Notifications are out of scope. Outward-facing | Send via SMS or email, after Jordan's OK |
| Record Jordan's "approve for payment" and lock the bill | Edit an approved bill | Brief: approved is immutable | Same |
| Handle a mid-month goodbye (final settlement) | Run on its own schedule | Bills arrive only when Jordan provides them | Scheduled monthly run |
| Show who to pay, how, and how much | Track whether visits actually happened | See §6 | Keep a visit log |

**"Approve" does not mean "pay".** It means: *"Jordan has looked at this and says it's good to pay."* The app records it and locks the bill. Jordan then pays through Venmo or Zelle, outside the app.

---

## 3. The monthly rhythm

The product is built around one cycle. Jordan pays at the start of each month for the previous month, so bills arrive then.

```
Start of month
   │
   ▼
Bills arrive (text, email, screenshot)  →  Jordan drops them in
   │
   ▼
Assistant checks each one
   │
   ├── CHECKS OUT ───────────────► Jordan: Approve for payment ──► pays via Venmo/Zelle
   │
   ├── DISCREPANCIES ──► Draft message to helper ──► helper sends a corrected bill ──► check again
   │
   └── MISSING ────────► Draft "where's your bill?" message
```

### State of each helper's bill for a period

This is **derived** from the data, not stored by hand.

```
NOT_RECEIVED ──► RECEIVED ──► CHECKED: checks out ──► APPROVED ──► PAID (Jordan marks it)
                                 │
                                 └─► CHECKED: discrepancies ──► (asked helper) ──┬─► new bill ──► RECEIVED ...
                                                                                 └─► "it's correct" ──► APPROVED with exceptions
```

The stored bill status stays `RECEIVED` while it's flagged. "Flagged" comes from the latest check.

```
```

### What Jordan sees: the Month screen

```
September 2026                                    Today: Oct 14
────────────────────────────────────────────────────────────────
Priya   babysitter   $626 billed   ⚠ 2 things to look at    [Review]
Lupe    cleaner      $820 billed   ⚠ $20 over               [Review]
Theo    dog walker   $580 billed   ✓ Checks out              [Approve]
────────────────────────────────────────────────────────────────
Waiting on you: 3 bills
```

If a bill hasn't arrived: `Theo   — not received yet   [Draft a reminder]`.

---

## 4. Capabilities, as Jordan experiences them

### 4.1 Learn agreements
Jordan pastes notes, drops screenshots, or types "Lupe goes to $150 on the 15th." The assistant shows what it understood **next to the source**, with its assumptions. Jordan confirms. Nothing is saved before that.

### 4.2 Month status ("have the bills come?")
Opening the app (or asking "what's the status?") shows, for each active helper, the bill for the most recent closed period. States: not received, received, checked, approved.

### 4.3 Check a bill
Every line gets a result: matches, differs, not covered by any agreement, can't compute, or can't verify. Jordan can click any line to see the rule, the agreement, and the source quote behind it.

### 4.4 Verdicts

Every checked bill gets exactly one verdict:

| Verdict | Meaning | Example (starter pack) |
|---|---|---|
| **CHECKS_OUT** | Every line matches and the total is right. May carry informational notes | Theo: "Rates and math check out. I can't verify the number of walks." |
| **DISCREPANCIES** | At least one line differs, isn't covered, or the total is wrong | Lupe: "Sep 1 and Sep 8 were billed $150. Your agreement was $140 until Sep 15. $20 over." |
| **NEEDS_INFO** | The assistant can't conclude, because a term is ambiguous or missing | "Priya mentioned a 'late rate'. I assumed $28/hr. Please confirm." |

### 4.5 Ask the helper
For a discrepancy or a missing bill, the assistant **drafts** a short, polite message. Jordan edits it, confirms, then copies it or opens it in their Messages app. The app records that the message was handed off. It does not send.

> *"Hi Lupe, thanks for September's bill. Sep 1 and 8 show $150, but the new rate started Sep 15 (we had $140 before). Could you send a corrected total of $800? Thanks!"*

**When it's resolved.** Two endings:
- The helper sends a corrected bill. It replaces the old one and is checked again.
- Jordan says "talked to Priya, the bill is correct." The assistant proposes approval with the flagged items as accepted exceptions, with Jordan's reason. Jordan confirms. If the talk changed the deal going forward (e.g. a $40 same-day fee), the assistant also proposes an agreement change.

### 4.6 Approve for payment
Jordan clicks Approve and sees a confirm dialog: amount, who, how to pay, and any accepted exceptions. After confirming, the bill is locked.

### 4.6a Mark as paid
After paying through Venmo or Zelle, Jordan clicks **Mark as paid** on the approved bill (date, method, optional note). The app records it. The bill itself stays sealed. No confirm step: the click is Jordan's own statement.

### 4.7 Settle mid-month
For a helper switch, Jordan says "Lupe's last day is Oct 14." The assistant proposes marking Lupe as ended on that date. After Jordan confirms, it expects a **final bill** for the partial period and can draft the request to Lupe. When the bill arrives, it's checked like any other.

### 4.8 Chat
Jordan can ask anything about the records: "What's Priya's Sunday rate?", "What changed for Lupe?". Answers come from the saved data, with sources.

---

## 5. Product decisions

| # | Decision | Why | Status |
|---|---|---|---|
| P1 | **Read-only on money.** The assistant never pays | No bank access. Also the safest design | Decided |
| P2 | **Approve = "good to pay", not "pay"** | Brief requires approval and immutability. It's a record, not a transfer | Decided |
| P3 | **Discrepancy path is "ask the helper"**, not "approve a corrected amount" | Jordan can't unilaterally change what a helper billed. Matches how this works in real life | Decided |
| P4 | **No scheduler.** A month-status check runs when Jordan opens the app or asks | A schedule can't see bills. They only arrive when Jordan pastes them. Production: EventBridge Scheduler | Decided |
| P5 | **Messages are drafted, not sent** | Notifications are out of scope. Outward-facing actions need Jordan | Decided |
| P6 | **Mid-month settlement is supported** via partial periods and ended helpers | You asked for it. Real households switch helpers | Decided |
| P7 | **Multiple chats** are saved and listable | Cheap, and it's an audit trail | Decided |
| P8 | **Long-term memory is on**, for soft facts only | Brief requires memory across conversations | Decided |
| P9 | **Approve with accepted exceptions** stays available as a secondary action | Jordan may know better than the bill (e.g. Sam really did OK the $40 fee). Without it, a flagged bill is stuck until the helper reissues | Decided |
| P10 | **Corrected bills replace earlier ones.** A new bill for the same helper and period supersedes the old unapproved one. If the period is already approved, see **S1** below | Real flow after "ask the helper" | Decided |
| P11 | **Services rendered**: light plausibility checks only (§6) | Cheap, uses data we already hold | Decided |
| P12 | **One user.** Whoever logs in can confirm and approve. No household members list | Multi-user is out of scope | Decided |
| P13 | **Mark as paid** on approved bills | Jordan needs to see what's been paid | Decided |
| P14 | **Helper profiles save without confirmation.** Terms, approvals, messages and engagement ends still need it | Gating name/phone edits was cumbersome | Decided |
| P15 | **Approval pays the sum of the lines,** never the stated total. A wrong total is shown and must be accepted as an exception | Totals are derived; the helper's total is a claim | Decided |

**On P9:** The brief says Jordan should be able to "approve a bill for payment." If P3 were the *only* path, Jordan couldn't approve a bill that has a known, acceptable exception. I'd keep a quiet secondary button: "Approve anyway…" with the exceptions listed and recorded in the approval.

### Sensitive decisions

These decisions touch money after Jordan has already said yes. They're easy to get wrong, so they're listed here on purpose. Revisit them before changing any approval code.

| # | Decision | What Jordan sees | Why | Risk |
|---|---|---|---|---|
| **S1** | **A corrected bill for a month that's already approved is not saved.** If the new bill covers exactly the same period, it's refused with `PERIOD_ALREADY_APPROVED`. If it only overlaps the approved period, it's saved, and its check carries a `PERIOD_ALREADY_APPROVED` finding (a discrepancy) | "September is already approved for Lupe. I didn't record this new bill." | An approved bill is sealed. Replacing it would quietly undo Jordan's approval and could lead to paying twice | If the helper genuinely made a mistake after approval (e.g. forgot a visit), there's no in-app path to record the extra amount. Jordan handles it outside the app. A future fix: a separate "adjustment bill" for an approved period |

---

## 6. Do we track services rendered?

You weren't sure. Here's the reasoning.

**What the brief asks:** *"is this what we agreed to?"* That's a question about **terms**: rates, rules, totals. It's not "did the visit happen?"

**But the data hints at it:**
- Theo billed 20 walks. September has 21 weekdays after Labor Day. We can't tell if one was missed or he skipped a day.
- Lupe came on all 5 Tuesdays. That matches "weekly Tuesdays".
- Priya's visits are ad hoc. Nothing to compare against.

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Terms only** | Check rates, rules, totals | Simplest. Matches the brief | Can't say anything about counts or days |
| **B. Plausibility** ✅ | A + compare billed dates with the **usual schedule** found in the agreement | Free: uses fields we already extract. Catches odd days and counts | Soft signal, not proof |
| **C. Visit log** | Jordan marks each visit as it happens | Real proof. Enables "what do I owe to date?" | Daily data entry. Out of scope |

**Recommend B.** Rules:

- The schedule is stored on the agreement as data (`weekly Tuesdays`, `weekdays`, `ad hoc`, or `unspecified`).
- Plausibility results are **informational notes**. They never change the supported amount and never block "checks out".
- Example: *"Billed 20 walks. September has 21 weekdays excluding Labor Day. I can't verify which ones happened."*

**What C would unlock, and what we lose without it:** "How much do I owe Lupe so far?" for settlement. Without a visit log, mid-month settlement means *"I'll check the final bill when it arrives"*, not *"here's what you owe."* That limit goes in DESIGN.md.

---

## 7. Screens

| Screen | Purpose |
|---|---|
| **Login** | One password |
| **Home** | One month: two small charts (billed per helper with the agreed amount, and billed per month for six months), the status of every helper's bill (the "have they come?" view), then every bill for the month, including approved, paid and replaced ones, with Mark as paid. The assistant fills the right-hand side. The page fits the window; each card scrolls on its own |
| **Bill detail** | Line-by-line check, verdict, source side-by-side. Actions: Approve, or Resolve in chat (a new chat seeded with the bill and everything flagged, where the assistant proposes fixes Jordan picks from), Ask the helper, Approve anyway |
| **Agreements** | Per helper: terms in effect or upcoming, each priced as a table (charge, amount, when it applies), with source links. Past terms are hidden behind "Show past agreements". Helper details (key, how to pay), editable directly |
| **Assistant** (chat) | Paste text, attach files or a whole folder (images, text files, PDFs), or drop them in; ask. Pending cards appear inline. Decided cards fold into a read-only "Approved in this chat" panel on the side. Chat list on the other side. Unsent text and attachments are kept until sent |
| **Decisions badge** | "3 things need you": pending confirmations |

**Start state:** The app starts empty. The first screen says: *"Add what you have"* with the assistant right beside it, ready for the starter-pack folder.

*Changed 2026-10-16:* Month and Bills were two screens; they're one now (Home), because "has the bill come?" and "which bills are there?" are the same question. Agreement cards show prices as a table, not a run-on line, with assumptions folded behind "Show assumptions" like the source.

**Look and feel:** a warm, calm "home ledger". Linen background, warm-white panels with soft borders, a sage accent and a terracotta house mark; Fraunces for headings, Nunito Sans for text. Every area is a titled panel; Home and the Assistant fill the window and scroll inside their panels. Assistant replies render their Markdown (headings, lists, tables); Jordan's attachments show as file-name chips.

---

## 8. Trust features

This is what makes it feel safe with family money.

- **Source beside extraction.** Screenshot on one side, what the app understood on the other.
- **Every number has a "why".** Click a line to see the rule, the agreement, and the quote.
- **Assumptions are visible.** "Assumed Sep 15." One click to change.
- **Plain words, not codes.** "Billed $150, agreed $140."
- **Approved bills look locked.** No edit controls render.
- **It says what it can't know.** "I can't verify the number of walks."
- **Nothing is silent.** Every agreement change, approval, message, or engagement end goes through a confirm step Jordan sees. Helper profile edits save directly but are always visible.

---

## 9. Out of scope (deliberate)

| Left out | Reason |
|---|---|
| Real payments, bank links | Brief |
| Sending SMS, email, push | Brief (notifications) |
| Automatic bill intake | Brief. Jordan pastes or uploads |
| Scheduled runs | See P4 |
| Visit log | See §6, option C |
| Multi-user, multiple households | Brief |
| Tax or 1099 reporting | Not asked |

---

## 10. Decisions already made (your list)

| Decision | Where it lands |
|---|---|
| TypeScript everywhere, React frontend, npm | Doc 2, Doc 4 |
| Hand-rolled agent loop | Doc 3 |
| Long-term memory on | Doc 3 |
| Multiple chats | P7 |
| Approve flow = validate, then ask the helper if off | P2, P3 |
| Auth: simple. Options listed for you | Doc 3 §9 |
