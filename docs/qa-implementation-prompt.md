# Implementation Work Order — QA Findings Fixes

Copy everything below the line into the AI (e.g., Gemini Flash 3.8) with repo access.

---

You are a senior full-stack engineer implementing fixes from a QA audit of the **COE Budget Transparency and Financial Monitoring System** (Node/Express + Supabase in `/server` and `/supabase`, Vanilla JS PWA client in `/client`, Electron wrapper in `/electron`). Every file and line reference below has been verified against the current codebase. Your goal: fix each finding correctly with the smallest safe change — no refactoring beyond what a fix requires.

## Ground rules

1. **One commit per finding ID**, message format `fix(C-01): <summary>`. Never bundle unrelated findings.
2. **Schema changes only via new migration files**, starting at `023_` (migrations run `001`–`022`). Never edit existing migration files. Make new migrations re-runnable (`IF EXISTS` / `CREATE OR REPLACE`) and non-destructive.
3. **Never run migrations or write queries against production.** Schema changes are delivered as files only; note in each commit message that migration `NNN` must be applied to staging first.
4. **Preserve existing code style** — comment density, naming, and idioms of each file you touch. Do not reformat untouched code.
5. **Do not change anything on the "keep list":** server-side role enforcement (`requireAdmin`, `requireGovernorOrAdmin`, `requireOfficer`), the SWR cache + Supabase Realtime sync in `client/js/api.js`, audit logging, Helmet/rate-limit/body-limit config, and the responsive dual-app layout. Fixes must not weaken any of these.
6. **Financial logic must balance.** For every change to a balance/total calculation, write out the arithmetic for a worked example in the commit body and confirm the numbers reconcile.
7. At the end of each finding's implementation, add a manual verification step (exact clicks/requests) to `docs/qa-implementation-prompt.md` → appendix. If a Playwright smoke test is feasible (Playwright is in devDependencies), add it under `tests/`; otherwise the manual steps suffice.

## Design decision (binding): envelope accounting model

Fixes C-02, C-03, and H-03 are coupled — implement them as one coherent model, then split into the three commits. The **transactions ledger is the single source of truth** for event envelope balances:

- `events.allocated_budget` is the *initial* allocation only. It is never mutated after creation.
- Every budget movement is a `transactions` row. Transfers create **paired rows**: one for the source event (`direction = 'out'`) and one for the recipient event (`direction = 'in'`).
- Event remaining budget (both the DB trigger and the API computed values) is always a **full recompute from the ledger**: `allocated_budget + SUM(transfers in) − SUM(transfers out) − SUM(expenses with use_allocation)`.

---

## Phase 1 — Quick wins

### C-01: Admin event creation blocked by method typo
- `client/js/admin.js:127` and `client/js/admin.js:318` call `Api.reports.getSummary()`, which doesn't exist — `client/js/api.js:154` defines `Api.reports.summary()`. Change both call sites to `Api.reports.summary()`. Do not add an alias in `api.js`.
- Acceptance: an admin can open the New Event form and submit a funded event; available balance shows the real General Fund figure, not ₱0.00.

### H-02: Notifications ignore officer/admin roles
- `server/routes/notifications.js:46` and `:119` read `req.user.role` (Supabase JWT role, always `"authenticated"`). First confirm the exact property the auth middleware attaches by reading `server/middleware/auth.js` (~lines 17–32; QA reports `req.profile.role`), then use that property at both call sites.
- Officer set must be `['admin', 'governor', 'cashier', 'officer']` — the current check misses `governor` and `cashier`.
- Acceptance: a governor sees notifications targeted at `officer`/`admin` roles; a student still sees only `student`/`all`.

### L-03: `alert()` in income form
- `client/js/income.js:76`: replace `alert('Income added to general fund successfully!')` with `UI.toast('Income added to general fund successfully!', 'success')`, matching the rest of the app.

### M-01: Broken receipt links in Excel export
- `server/routes/reports.js` Excel export (~lines 364, 379–382) writes the raw `receipt_url` (a relative Supabase Storage path) into the hyperlink. Run the transactions array through the same `signReceipt` helper the PDF path uses before writing worksheet cells.
- Acceptance: "View Receipt" in the exported .xlsx opens a signed HTTPS URL.

### M-04: Missing accessible labels
- `client/index.html` (~lines 418–426, 459–471): add `aria-label` (or visually hidden `<label class="sr-only">`) to `#events-search`, `#events-sort`, `#tx-search`, `#filter-type`, `#filter-event`. Use the visible placeholder text as the label wording.

## Phase 2 — Financial core (implement in model order: migration first, then server, then client)

### H-03: Allow `transfer` transaction type (migration 023)
- `supabase/migrations/001_initial_schema.sql:69` check constraint excludes `'transfer'`, while `014_event_budget_trigger_fix.sql:33` already anticipates it. New migration `023_allow_transfer_tx_type.sql`:
  1. Drop the existing `transactions_type_check` constraint and re-add it including `'transfer'`.
  2. Add nullable column `direction TEXT CHECK (direction IN ('in','out'))` to `transactions` (null for non-transfer rows).
- `server/routes/transactions.js:11`: add `'transfer'` to `VALID_TX_TYPES`, but reject `type === 'transfer'` on all client-facing create/update routes (transfers are created only by the admin transfer route). The type-filter dropdowns in the UI must not offer "Transfer".

### C-02: Transfers double-count / never deduct
- `server/routes/admin.js:270` increments the recipient's `allocated_budget` directly, and `server/routes/events.js:36-54` (list) and `:87-88,113` (single event) add `transfer` amounts again via `budget_injections`. Rework the transfer route (~lines 269–312) to the binding model:
  - Never mutate `allocated_budget`. Insert **two** ledger rows: `{ event_id: fromEvent, type: 'transfer', direction: 'out', amount }` and `{ event_id: toEvent, type: 'transfer', direction: 'in', amount }`. Keep the existing audit-log call for the transfer.
  - Fix event-to-event transfers the same way: today (`admin.js:296-301`) only the recipient is recorded and the source event's balance is never reduced.
- Update both `computed_remaining` sites in `server/routes/events.js` to: `allocated_budget + SUM(transfer in) − SUM(transfer out) − SUM(alloc expenses)`.
- **Reconciliation in migration 023:** past transfers may have inflated `allocated_budget` with no ledger row (the constraint blocked the insert but the row update at line 270 was not rolled back). Add a diagnostic section: after recomputing `remaining_budget` for every event from the ledger, `SELECT` events whose `allocated_budget` exceeds the sum of their `allocation`-type ledger rows and output them as a review list. Do not attempt to guess corrections — flag them.
- Worked example for the commit body: Event B starts ₱0; ₱5,000 transferred from General Fund → B shows remaining ₱5,000. Then ₱5,000 transferred B → Event C → B shows ₱0, C shows ₱5,000. Total across events unchanged.

### C-03: Trigger desyncs on edit/delete
- `014_event_budget_trigger_fix.sql:24-58` uses **delta** semantics on INSERT only. Replace `sync_event_balance()` with a **full recompute per event** (same formula as C-02, ledger-derived) and attach the trigger as `AFTER INSERT OR UPDATE OR DELETE ON public.transactions`. On UPDATE/DELETE use `NEW.event_id` / `OLD.event_id` respectively (recompute both when the event_id changes). Because the function recomputes from scratch, it is idempotent. Include the same recalibration `UPDATE` as 014 did, under the new formula. Put this in a new migration (e.g. `024_event_balance_trigger_recompute.sql`), not by editing 014.
- Acceptance (manual, staging): expense ₱2,000 on a ₱10,000 event → remaining ₱8,000; edit it to ₱3,000 → ₱7,000; delete it → ₱10,000.

### C-04: Over-budget event spending vanishes from General Fund
- `server/routes/reports.js:20-54`: when an event's `use_allocation` expenses exceed its envelope (allocation + net transfers), the excess is counted nowhere. Compute each event's deficit `Math.max(0, allocExpenses − (allocated_budget + transfersIn − transfersOut))`, subtract total deficits from `remainingBalance`, and expose the figure as `totalEnvelopeDeficits` in the summary payload.
- Acceptance: ₱10,000 event with ₱15,000 allocated expenses → dashboard balance drops by the ₱5,000 excess.

### H-04: Non-reconciling terminology
- Standardize labels exactly: unreserved funds → **"Available General Fund"**; `totalIncome − totalSystemExpense` → **"Net Cash Balance"**; event cards show **"Total Event Spending"** (all expenses for the event) and **"Budget Utilization"** (spending charged against the envelope) as separate figures instead of the current contradictory "Expenses"/"Remaining" pair.
- Touch: `client/js/dashboard.js` (~49–80), `client/js/events.js` (~98–103), `client/js/reports.js` (~109–132), and the PDF/Excel generators in `server/routes/reports.js` (~251, ~397) so every surface uses the same definitions. Add a one-line subtitle on the dashboard explaining "Available General Fund = Net Cash Balance − unspent event envelopes" so Income − Expenses = Balance is never implied.

## Phase 3 — High-severity access & visibility

### H-01: Public transparency gate (feature-flagged)
- Today everything requires auth (`server/index.js:157-163`) and the client gates on enrollment (`client/js/app.js:508-516`, `695-729`). Implement a **read-only public viewer**, default OFF:
  - Gate behind env var `PUBLIC_TRANSPARENCY_MODE` (absent/false = current behavior, unchanged).
  - New `server/routes/public.js`: `GET /api/public/summary` and `GET /api/public/events` returning only sanitized aggregates (event names, allocated/remaining totals, anonymized transaction type+amount+date). No donor names, no receipt URLs, no user identifiers. No auth middleware.
  - Client: when the flag is on, logged-out visitors get a read-only dashboard view; the enrollment modal is skipped until they attempt an authenticated action.
- This is a product decision as much as a code fix — implement minimally and leave a note in the commit body that the field set was chosen conservatively.

### H-05: Missing pagination truncates the ledger
- `server/routes/transactions.js` (`MAX_LIMIT = 100` at line ~12): support `page`/`limit` (server-clamped) and return `total` count. Update `client/js/transactions.js` and `client/index.html` with a pagination bar. Keep the default page size 100.
- Keyword search must hit the server (extend the existing query params) so older records are findable.

### H-06: Income tracker shows empty state
- `client/js/income.js:10-14` fetches the default 100-row ledger and filters client-side. Extend the transactions list endpoint to accept multiple `type` values (e.g. `type=donation,collection,allocation`), and have `income.js` query with those types plus pagination from H-05. Do not rely on client-side filtering of a truncated window.

## Phase 4 — Medium severity

### M-02: UTC date shift
- `client/js/ui.js:88-93` and `server/routes/reports.js` (~179, ~313): parse `YYYY-MM-DD` strings by splitting components (never `new Date(string)` for date-only values), and format with `timeZone: 'Asia/Manila'`.
- Acceptance: `2026-09-03` renders as September 3, 2026 in any browser timezone.

### M-03: Contrast failures on orange
- `client/styles/main.css` (~22, 42, 131, 161): deepen the CTA orange from `#F97316` to `#C2410C` where white text sits on it (≈4.8:1, passes AA), and darken orange-on-white text/badges to the same tone. Update the token, remove the apologetic comment at line 42, and spot-check focus rings and dark mode.

### M-05: Offline boot demotes admins
- `client/sw.js` never caches `/api`, so offline boot makes `app.js` (`695-729`) demote everyone to unverified student and trap them in the registration modal. In `bootApp`, check `navigator.onLine === false` (plus a Supabase reachability fallback): skip roster/profile verification and the modal, render the cached shell with a persistent "Offline — reconnect to refresh financial data" banner.

### M-06: CSV import corrupts quoted names
- `client/js/officer/officer-app.js:2788-2800` splits lines on commas. Replace with PapaParse (already used in `client/js/admin.js` — reuse the same import pattern). Acceptance: `"DELA CRUZ, JUAN P.",M,BSCoE,2` imports one row with intact name/course/year.

## Phase 5 — Low severity

- **L-01** (`server/routes/announcements.js:47`): include `posted_by: req.user.id` in the insert payload.
- **L-02** (`server/lib/email.js:368`): point "Manage preferences" at the existing profile/settings modal route in the SPA; if none exists, remove the link.
- **L-04** (`client/js/transactions.js:12`): replace the `#user-role` DOM-text check with the in-memory profile object (`profile?.role === 'admin'`), using whatever profile state `app.js` already exposes.

## Final deliverable

End with a summary table: **Finding → Files changed → Migration required? → Manual verification steps**. Then list any finding you could not complete, why, and what decision it needs from the team. If any fix would require changing behavior not described above, stop that item and flag it instead of improvising — silent scope creep on financial code is worse than an incomplete pass.
