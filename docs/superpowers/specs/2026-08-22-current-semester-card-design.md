# Current Semester Card — Design

**Date:** 2026-08-22
**Status:** Approved (brainstorming complete)
**Scope:** Academic Progress page (`client/index.html`, `client/js/units.js`, `server/routes/units.js`, Supabase migration)

## Problem

The Academic Progress page shows graduation progress and a Year 1–4 curriculum checklist, but a student cannot see at a glance what they are enrolled in *right now*. "Currently enrolled" exists in the data (`student_units.status = 'enrolled'`) but is scattered across year tabs and invisible to the progress bar, which counts only passed units.

## Goal

A compact, read-only **"Current Semester"** card at the top of the checklist column showing currently enrolled courses, each with optional instructor/schedule details, plus a two-tone progress bar that visualizes in-progress units without overstating completion.

**Primary constraint: do not overwhelm.** No new management UI, no new buttons in the card, no term-centric rework. Management stays in the year checklist exactly where it is today.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Detail per course row | Code, title, units + optional schedule & instructor (free text) |
| Data source for schedule/instructor | Optional text columns on `student_units` — student-self-reported, consistent with existing pattern |
| Placement | Compact card at top of the checklist column, above Year 1–4 tabs |
| Progress bar | Two-tone: green = passed (unchanged), lighter segment = in-progress; % stays passed-only |
| Build approach | Reuse existing data flow (client-side filtering of `/api/units/my` payload) — no new endpoints |

## UI Design

### Card placement

Pinned to the top of the right column (above the Year 1–4 tabs). Existing tabs and checklist untouched. On mobile, the card stacks naturally above the tabs.

### Card layout

```
┌─ Current Semester — 1st Sem, AY 2026–2027 ────────── 21 units ─┐
│                                                                  │
│  CPE 211   Logic Circuits & Switching Theory             3       │
│            MWF 9:00–10:00 · Engr. Cruz                          │
│                                                                  │
│  CPE 212   Logic Circuits Laboratory                     1       │
│            T 1:00–4:00 · Engr. Reyes                             │
│                                                                  │
│  MATH 113  Calculus 3 for Engineers                     3       │
│            (no schedule/instructor logged — second line hidden) │
└──────────────────────────────────────────────────────────────────┘
```

- **Primary line:** course code, title, right-aligned unit count as a plain number (`3`, not `3u`).
- **Second line (optional):** muted, smaller text `schedule · instructor`. Rendered **only when at least one of the two fields is non-empty**. No dash placeholders, no empty lines. When only one field exists, render it alone (no dangling separator).
- **Header:** term label from the existing `currentSchoolYear()` / `currentSemester()` helpers in `client/js/units.js` (handles Summer/semester 3), enrolled-unit subtotal right-aligned with the word "units" (only place the word appears).
- **Interactions: none.** The card is read-only. Edit / drop / mark-passed remain in the year checklist. One place to manage, one place to glance.

### Empty state

The card never disappears. When no courses are logged for the current term it shows a single line: *"No courses logged for this semester yet — log them in the checklist below."* This keeps page structure stable between visits.

### Two-tone progress bar (Graduation Progress card, left aside)

- Green fill: passed units (unchanged math).
- New lighter segment appended after the green fill: in-progress units (current-term `enrolled` rows only).
- Caption becomes e.g. *"93 / 189 units · 24 in progress"*.
- The large percentage number remains **passed-only** so completion is never overstated.
- Segment math is additive and clamped so the total fill never exceeds the track.

## Data & API Changes

### Migration 007 — `supabase/migrations/007_enrollment_details.sql`

```sql
ALTER TABLE public.student_units
  ADD COLUMN IF NOT EXISTS instructor TEXT,
  ADD COLUMN IF NOT EXISTS schedule   TEXT;
```

Both nullable, plain text. No RLS changes (existing row-level policies cover the whole row for the owning student). No backfill; existing rows render without a second line.

### Server — `server/routes/units.js`

- `GET /api/units/my` — add `instructor, schedule` to the SELECT list.
- `POST /api/units/enroll` and `PATCH /api/units/update/:id` — accept both fields as optional strings. `trim()`, cap at 120 characters, store `NULL` when empty (so "never filled" and "cleared" are identical).

### Client — `client/js/units.js`, `client/index.html`

- The existing log/edit modal gains two optional text inputs ("Schedule", "Instructor"), placed **after** the required fields so the core log-a-course flow is unchanged. Placeholder example: `MWF 9:00–10:00 AM`.
- New `renderCurrentSemester()`: filters the already-loaded `/api/units/my` payload to `status === 'enrolled'` AND `(school_year, semester)` matching the computed current term; renders the card. No extra network request.
- New `currentCardRow()`: renders one row; second line composed from the two optional fields.
- **Escaping:** `instructor` and `schedule` are free text rendered into HTML strings. Both pass through an HTML-escape helper before interpolation (numeric fields never carried this risk).
- `renderProgress()`: additionally sums units of current-term enrolled rows, appends the lighter segment, updates the caption.

## Edge Cases & Error Handling

- **Stale 'enrolled' rows from a past term** — excluded from the card and the in-progress segment (current term only, by design). They remain visible in the year checklist where the student can close them out. No nagging UI.
- **Term rollover** — when the computed term flips, the card becomes the empty state for the new term; prior-term courses remain in the checklist. No state migration.
- **Long titles/schedules on mobile** — second line wraps; the card has no fixed height.
- **`/my` load failure** — the card uses the same fallback state as the checklist; no special-case handling.
- **XSS** — all free-text (instructor, schedule) HTML-escaped wherever rendered.

## Testing

No automated test harness in the repo; use a manual QA checklist plus one smoke script.

1. Apply migration 007 → existing rows unaffected; new columns read as null.
2. Enroll a course *with* schedule/instructor → card row shows second line.
3. Enroll a course *without* → card row shows no second line.
4. Edit a course to clear both fields → second line disappears (empty → NULL round-trip).
5. Drop the only enrolled course → card shows empty state; in-progress segment returns to zero.
6. Progress math: passed 93 + enrolled 24 + required 189 → green to 49%, lighter segment to ~62%, caption "93 / 189 units · 24 in progress".
7. Mobile viewport: card stacks above tabs; rows wrap; no fixed-height clipping.
8. Smoke script (pattern of `scripts/smoke-test-standing.js`): hit `/api/units/my` and assert the new fields are present in the payload.

## Non-Goals

- Admin-managed sections / centralized class schedules
- Structured timetable / weekly calendar view
- Counting enrolled units as completed
- Changes to the Standing PDF
- Notifications or reminders
