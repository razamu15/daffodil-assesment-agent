# Decisions

The decisions that shaped this project: where there was a real choice, a reasonable alternative was turned down, and reversing it would change how the product behaves or how the system is built. Six are about the product, nine about the technology. After them come the [choices any careful engineer would make](#choices-a-reasonable-engineer-would-make), listed briefly, and the [named future fixes](#named-future-fixes).

Each entry gives the decision, why, what was turned down, the trade-off accepted, and where it lives. Short names for the planning docs: PS product spec, SD system design, AD agent design, BP build plan (all in [`working_docs/`](working_docs/)).

The full raw compilation (about 280 entries, the starter-pack assumptions log and a list of places where sources disagree) is kept in [`DECISIONS_v1.md`](DECISIONS_v1.md).

---

## Product

### 1. The assistant proposes; Jordan confirms. It never pays and never sends.

Every change to terms, every bill approval, every message and every engagement end is a *proposal* that waits for Jordan to press Confirm. "Approve" means "good to pay", not "pay": Jordan pays through Venmo or Zelle outside the app and can then mark the bill paid. Messages are drafted, then copied or opened in Messages and recorded as `HANDED_OFF`, never `SENT`, because the app can't know they were sent. Helper profile details (name, phone, how to pay) are the exception: they save directly.

- **Why:** money decisions and anything outward-facing are Jordan's.

### 2. A flagged bill's main path is "ask the helper". "Approve anyway" is a quiet second option.

When a bill doesn't match, the main action drafts a message to the helper. A corrected bill from the helper replaces the old unapproved one, which is kept as `SUPERSEDED`. Jordan can still "Approve anyway...", but every flagged item then needs an accepted exception with a reason. 


### 3. A bill is a claim, not a source of truth.

The approved amount is always the sum of the lines, never the total the helper wrote. A wrong total is shown and must be accepted as an exception (Priya: $596 approved, not the $626 she wrote). A bill never defines terms: if it charges $28 and no agreement says $28, the line is flagged, and a document that was recorded as a bill can't be read as an agreement. When sources disagree, a direct dated message from the helper beats a pasted thread, which beats Jordan's typed notes, which beat a bill. The assistant shows both sides and proposes; Jordan decides.

- **Why:** totals are derived numbers, and a bill is what the helper says they're owed. Letting a bill set the rate would make every overcharge check out.

### 4. Mid-month goodbyes are supported: helpers end, they are never deleted.

Jordan says "Lupe's last day is Oct 14". The assistant proposes ending the engagement (reminding Jordan when the helper has a house key), and month status then expects a final bill covering the start of the month to the 14th. 

### 5. The model understands, code decides, the database is the truth.

The model reads messy input and explains results. Pure, deterministic code does the comparing, pricing and enforcing: `checkBill` gives the same check for the same inputs and never calls a model. Confirm is the commit, and no model runs anywhere on that path. Long-term memory (AgentCore) holds soft facts like nicknames and preferences, and goes into the prompt as "background hints, may be outdated". Money facts always come from tools.


### 6. The safety line is the tool list and the core gates, not the system prompt.

The agent gets read tools, record tools (save a helper, record a bill) and propose tools. It has no `confirm`, `approve`, `send`, `edit approved bill` or `delete`. Every gated change goes through one `PendingAction` pipeline (`AGREEMENT_CHANGE`, `BILL_APPROVAL`, `HELPER_MESSAGE`, `HELPER_ENGAGEMENT_END`). The UI's Approve button calls the same propose-and-confirm function as the chat. 

- **Why:** a prompt can be talked around; a missing tool can't. One pipeline means confirm logic, the audit trail and conflict handling are written once.

### 7. Agreements are versioned data with honest gaps.

Terms are rows with effective dates. A rate change adds a version and never overwrites the old one, so September 1 is still checked against the old rate (Lupe's case). Approval freezes a snapshot of the check and the term versions used, so a later change can't rewrite what Jordan approved. A price is a list of typed pricing rules (hourly, hourly after a time, flat block, day multiplier, per unit, fee) run by one engine. 

### 8. Documents are read by a quarantined model call.

Images, PDFs and pasted threads reach the model only through a separate extraction call to prevent prompt injection. That call has no tools except one forced output schema, and its output is validated once (one repair attempt, then fail loudly). In chat history, attachments appear only as an id and kind. If a document contains instructions, the assistant ignores them and tells Jordan.
