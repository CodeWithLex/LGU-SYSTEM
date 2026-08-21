# Admin Academic Management — Design (Sub-project 1 of the Full Admin)

**Date:** 2026-08-22
**Status:** Approved (brainstorming complete)
**Scope:** `client/index.html`, `client/js/admin-units.js` (new), `client/js/api.js`, `server/routes/admin-units.js` (new), `server/routes/units.js` (PDF extraction + stamping), `server/lib/standing-pdf.js` (new), `supabase/migrations/008_admin_academics.sql`, `scripts/smoke-test-standing.js`

## Problem

The app now centers on the student academic dashboard, but the admin has zero academic capability: curricula/subjects are SQL-seeded with no management UI, no admin can view or correct any student's records, and the Standing PDF is self-only. Meanwhile financial admin (events, transactions, transfers, audit) is mature. "Full admin" was scoped with the user into three sequenced sub-projects — **1. Academic Management (this spec)**, 2. Content Management (events/announcements CRUD), 3. User Profile Editing — housed in the existing `#view-admin` (evolve, not standalone), so the Electron admin shell inherits everything.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Overall approach | Evolve existing admin view (5-tab IA lands with sub-project 2; this adds an "Academics" tab) |
| Record ownership | Students keep self-service; admin gets view + override |
| Subject lifecycle | Edit + archive; hard delete never exists |
| Admin mutations | Reason required (≥ 5 chars) + audit-logged, mirroring transaction edits |
| Provenance | Every write to `student_units` (student or admin) stamps `last_edited_by` + `updated_at` |
| Standing PDF | One shared builder lib used by self route and admin route |

## UI Design

New **Academics** tab in `#view-admin` (admin-only via existing `body.is-admin` mechanism), two cards:

**1. Student Records** — search input (name/email, min 2 chars) → results list (name, program, year) → selecting a student opens their workspace:
- Header: name, program, enrollment year, progress % + units completed (same math as the student dashboard), **Download Standing (PDF)** button.
- Records table: every logged subject (code, title, units, SY, sem, status, grade, instructor/schedule, last edited by/when) with **Edit / Add / Remove** actions using the same fields as the student Log modal, plus a required Reason field.

**2. Curriculum Manager** — program selector → subject table (code, title, units, year/sem, prerequisites, elective, count of referencing student records, archived badge) with:
- Add/Edit Subject modal (migration's fields and constraints).
- Archive/un-archive action; no delete anywhere.
- Editable `total_units` per program (single number field).

## Data & API Changes

**Migration 008** (`supabase/migrations/008_admin_academics.sql`, guarded/re-runnable):
- `subjects.is_archived BOOLEAN NOT NULL DEFAULT FALSE`
- `student_units.last_edited_by TEXT NULL`
- `student_units.updated_at TIMESTAMPTZ DEFAULT NOW()`

**New `server/routes/admin-units.js`** — mounted under `/api/admin`, whole router behind `requireAdmin`; every mutation requires `reason` (≥ 5 chars) and calls `logAudit`:

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/students?q=` | Search student profiles by name/email |
| `GET /api/admin/students/:id/units` | That student's records joined with subjects |
| `POST /api/admin/students/:id/units` | Admin adds a record for the student |
| `PATCH /api/admin/units/:recordId` | Admin edits any record |
| `DELETE /api/admin/units/:recordId` | Admin removes a record |
| `GET /api/admin/students/:id/standing` | That student's Standing PDF |
| `POST /api/admin/subjects` | Create subject |
| `PATCH /api/admin/subjects/:id` | Edit subject (incl. `is_archived`) |
| `PATCH /api/admin/curriculum/:program` | Edit `total_units` |

Validations mirror the student endpoints verbatim (school-year regex, grade 1.0–5.0, status enum, `sanitizeOptionalText`). Audit actions: `ADMIN_ADD_STUDENT_UNIT`, `ADMIN_EDIT_STUDENT_UNIT`, `ADMIN_DELETE_STUDENT_UNIT`, `ADMIN_EDIT_SUBJECT`, `ADMIN_ARCHIVE_SUBJECT`, `ADMIN_EDIT_CURRICULUM`, `ADMIN_STANDING_PDF`. *(Amendment 2026-08-22: `ADMIN_VIEW_STUDENT_UNITS` was dropped — logging every workspace open flooded the audit viewer; reads are not audited, only mutations.)*

**PDF refactor:** the standing-PDF builder (~280 lines inline in `GET /units/standing`) moves to `server/lib/standing-pdf.js` — `buildStandingPDF({ profile, program, subjects, records, res })` — called by both the self route and the admin route. `scripts/smoke-test-standing.js` is updated to extract from the new lib (same vm technique).

**Archive semantics:** `GET /api/units/checklists` filters `is_archived = false` (student view stays clean); the Curriculum Manager lists archived subjects with a badge and can un-archive; the Standing PDF includes archived subjects when records reference them.

**Stamping:** `POST /units/enroll`, `PATCH /units/update/:id` (student self-service) also set `last_edited_by` (the student's email) and `updated_at`, so provenance exists for every write, not just admin ones.

## Client Design

- `client/js/admin-units.js` — IIFE `AdminUnits { load() }`, self-contained helpers (esc, term labels) per codebase convention; renders the two cards; lazy-loads on first tab activation.
- Record modal reuses `.modal-overlay`/`.modal-card` (blur + close animation), toasts, and the admin tables' horizontal-scroll mobile pattern.
- `Api.admin.*` gains wrappers for the nine endpoints.
- `client/index.html`: tab button + `#admin-tab-academics` panel + record modal markup.

## Safety & Edge Cases

- Reason gate (≥ 5 chars) enforced client and server.
- Concurrent student/admin edits: last-write-wins, visible via `last_edited_by`/`updated_at` (never silent).
- Editing a subject's units shows a confirmation warning that it retroactively changes referencing students' progress.
- `UNIQUE(program, code)` conflict → 409 with friendly toast.
- Subject deletion is never offered — archive only, reversible.
- Admin PDF filename uses the student's name, sanitized like the self-PDF.
- Admin actions on students of any program are allowed (admins are not program-locked).

## Testing

- `node --check` on every touched JS file.
- `smoke-test-standing.js` updated for the lib extraction and still producing a valid PDF.
- Manual QA checklist: search → view → add/edit/remove with reason → each action present in `audit_logs`; archive a subject → hidden in student checklist, still present in that student's PDF; change `total_units` → student progress recomputes; generate a student's PDF as admin; mobile pass on the new tables; reason-gate rejects short reasons.

## Non-Goals (tracked for later sub-projects)

- Events/announcements management (sub-project 2, which also lands the 5-tab IA reorg)
- User profile field editing — course, enrollment_year, year_level (sub-project 3)
- `audit_logs` baseline migration (out-of-band table; schema to be captured separately)
- Bulk academic record import, analytics dashboards
