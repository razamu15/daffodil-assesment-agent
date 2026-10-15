# TRACK C: THE FACE (`web`)

**GOAL:** Build the React screens from Doc 1 §7 against a mock API that serves scenarios built from `@helper-assistant/fixtures`, with a scenario switcher. No backend.

**READ** (only these):
- `working_docs/product-spec_latest.md` §1, **§3** (bill states, Month screen), §4 all, §5, **§7** (screens, start state), **§8** (trust features), §9
- `working_docs/system-design_latest.md` §2 (one URL, no CORS), **§3** (login, chat polling, upload resize, confirm, Approve button), **§4** (API surface), §6 "Gotchas" (hash routing)
- `working_docs/agent-design_latest.md` §2.3 (Bill, LineItem, Approval, PendingAction, OutboundMessage, BillingPeriodStatus), §2.4, §3.1–3.3 (line statuses, verdicts), §4.6 (conflicts, STALE), §9 (token in memory, `Authorization: Bearer`), §10 (esp. C7, C8, C10, C12, C13)
- `working_docs/build-plan_latest.md` §2 (seams), §3 (Track 0 notes), **§4 Track C** (scenario table), §6.1

**IMPLEMENT** against these contract files (read, never edit):
- `packages/domain/src/api/routes.ts` (`apiRoutes`, `RouteBody`, `RouteResponse`) and `api/schemas.ts` (incl. `ApiErrorCodeSchema`, `TurnViewSchema`, `UploadDocumentRequestSchema`)
- `packages/domain/src/entities/*` (types to render), `enums.ts`, `targetKeys.ts` (group conflicting cards by `targetKey`)
- `packages/domain/src/constants.ts`: `TURN_POLL_INTERVAL_MS`, `UPLOAD_MAX_IMAGE_EDGE_PX`, `UPLOAD_MAX_BASE64_CHARS`, `AUTH_TOKEN_TTL_HOURS`

What to build in `apps/web`:
- A typed API client derived from `apiRoutes`. Parse every response with the route's `response` schema, which makes it the UI's one validation boundary.
- A mock transport that answers **every** route in `apiRoutes` per scenario. It is the only code that imports `@helper-assistant/fixtures`. Dev mode selects it; the production build calls the real `/api` and must not bundle the mock.
- Screens: Login, Month (home), Bill detail (line-by-line, source beside extraction), Agreements, Assistant chat (pending cards inline, chat list), Decisions badge. Use hand-rolled hash routing (`#/month`).

**SCENARIOS** (build-plan §4 Track C). Build each from `starterPackHousehold`, `starterPackHelpers`, `starterPackTerms`, `starterPackBills`, `starterPackDocuments`, `expectedBillChecks`, `expectedSeptemberMonthStatus` and `STARTER_PACK_TODAY`:
`empty` · `month-mixed` · `bill-flagged` · `pending-conflict` · `approved` · `helper-ended`

The fixture bills have `latestCheck: null`. Fill `BillCheck` values in the mock from the answer key. **The UI never computes verdicts or statuses.** It renders what the API returns. If a scenario needs data the fixtures don't have (pending actions, an Approval, an ended helper), build it in the mock folder with explicit values, not invented defaults that look real.

**OWN:** `apps/web/`

**DO NOT TOUCH:** `packages/domain` (frozen; ask Saad if a contract change is needed), `fixtures/` (add scenario data under `apps/web`, not there), all of `packages/*`, `apps/local-server`, `infra/`, root config, and the `*_latest.md` docs. **No new npm dependencies without asking.** MSW and router or UI libraries are *not* installed; use a small in-app stub and plain React.

**USE FAKES FOR:** the whole backend. The mock API is the only fake. No `fetch` to a real server until I1.

**ALSO (decided after Track 0, see product-spec P12–P14):**
- A **Bills** list by month, including approved and paid bills, with a **Mark as paid** form (date, method, note) on approved bills.
- Helper details are editable directly on the Agreements screen (no confirm card).
- No household members anywhere: one user.

**DONE WHEN:**
```
npm run dev -w apps/web      # scenario switcher in the corner; all six scenarios click through
npm run build -w apps/web    # production build passes, mock not bundled
npm test -w apps/web         # every scenario's mock responses parse against apiRoutes response schemas
npm run check
```
Saad's by-eye check: is it obvious what needs a decision? Can you tell why a bill was flagged within 5 seconds?

**OUT OF SCOPE:** any server code, real auth and token verification (the mock accepts any password, except one wrong-password case to show the error state), wiring to `localhost` (I1), image upload to S3 (the client-side resize *is* in scope), sending messages (copy and an SMS link only, per product spec), payments, E2E browser automation.

**WORKTREE** (Saad runs this; commit Track 0 to `main` first, because HEAD is still `initial commit`):
```
git worktree add ../ws-face    -b track-c-face
cd ../ws-face && npm ci
```
