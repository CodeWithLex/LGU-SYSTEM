# Officer Console - Separate Window for Governor & Cashier - Design

Date: 2026-08-31
Status: Approved (design), implementation in progress

## Problem

The system has exactly two roles, `student` and `admin`, and admin is
all-or-nothing: whoever records money can also delete transactions, manage
users, and rewrite the audit trail's neighborhood. The council's actual
offices - governor (oversight) and cashier (recording) - have no
representation, and treasury work is mixed into the student-facing app.

## Goal

A separate full-window console for designated officers, delivered as a second
page (`/officer.html`) served by the same Express server with the same login,
backed by two new roles (`governor`, `cashier`) that make the separation mean
something: segregation of duties, not the admin panel with different wallpaper.

## Decisions Made

- **Separate page, same login.** New `client/officer.html` + own CSS + own JS
  modules; reuses `api.js`, `ui.js`, `receipt-capture.js` and the existing
  Express API. No Electron. Officers visiting the main URL see the student
  system plus an "Open Officer Console" entry point; the main admin panel
  stays `admin`-only.
- **Two new roles** on `profiles.role` (`governor`, `cashier`), assigned by
  admins today and by governors tomorrow. A single generic `officer` role plus
  a position field was rejected: permission checks need to distinguish the
  offices.
- **The console is treasury & operations only.** Six sections: Fund Overview,
  Record Transaction, Events & Budgets, Reports & Paper Trail, People &
  Access, Announcements. Deliberately excluded: curriculum tracker, Grizz,
  academic progress, profile settings.

## Permission Matrix

| Capability | cashier | governor | admin |
| --- | --- | --- | --- |
| Record transactions + receipts, budget transfers | yes | yes | yes |
| Create/edit/complete/archive events, announcements | yes | yes | yes |
| Reports, event PDF/Excel export, audit trail (read) | yes | yes | yes |
| View people list | yes (read) | yes | yes |
| Assign officer roles (student/governor/cashier) | no | yes | yes |
| Assign/remove `admin` role | no | no | yes |
| Delete transactions, bulk import, main admin panel | no | no | yes |

## Server Changes

- New `server/middleware/roles.js` exporting shared `requireAdmin` and
  `requireOfficer` (admin/governor/cashier); per-file local copies are
  replaced with imports.
- `requireOfficer` replaces `requireAdmin` on: `POST /api/transactions`
  (create; bulk stays admin), `POST/PATCH /api/events*`,
  `POST /api/announcements`, `GET /api/admin/audit-logs` (read),
  `GET /api/admin/users` (read), `POST /api/admin/budget-transfer`,
  `PATCH /api/admin/events/:id/archive`, event PDF/Excel export.
- `PATCH /api/admin/users/:id/role` gains role-aware rules: admin may set any
  of the four roles; governor may set `student`/`governor`/`cashier` on
  non-admin users only; self role-change remains blocked; cashier gets 403.
- Stays `requireAdmin`: `DELETE /api/transactions/:id`, `POST
  /api/transactions/bulk`, announcements DELETE, profile deletes.

## Client: Officer Console

- `client/officer.html`: own shell - fixed deep-navy sidebar on desktop,
  bottom tab bar on mobile; denser, numbers-first aesthetic distinct from the
  student app. No theme toggle in v1.
- Session: no duplicate login page. `officer-app.js` checks the existing
  Supabase session via `window.supabaseClient`; no session or non-officer
  role redirects to `/`.
- Sections:
  1. **Fund Overview** - total funds, general fund, reserved across events,
     month-to-date in/out, per-event low-balance alerts (90%+).
  2. **Record Transaction** - the money form with the receipt camera as the
     hero action.
  3. **Events & Budgets** - event cards, create/edit/complete/archive,
     budget transfer with preview.
  4. **Reports & Paper Trail** - events summary, PDF export, read-only
     searchable audit log.
  5. **People & Access** - user list; role selector visible to
     governor/admin, cashier sees read-only.
  6. **Announcements** - post form + recent list.
- Main app: body gains `is-officer` class when role is governor/cashier; a
  `.officer-only` sidebar entry ("Officer Console") links to `/officer.html`;
  header role label shows Governor/Cashier; admin-only UI unchanged.

## Data Layer

- Migration `016_officer_roles.sql`: widen `profiles_role_check` to include
  `governor`/`cashier` (re-runnable); add `is_officer()` SQL helper; RLS
  write policies on events/transactions/receipts/announcements move from
  `is_admin()` to `is_officer()` (defense-in-depth - the server uses the
  service key, but direct anon/authed writes stay denied for non-officers).
- New audit labels: `SET_USER_ROLE` gains `changed_by_role`; existing
  CREATE/UPDATE labels unchanged.

## Error Handling & Access Rules

- Cashier hitting an admin-only endpoint: existing 403 shape.
- Student opening `/officer.html`: dedicated access-denied screen, no data,
  with a link back to the main app.
- Unauthenticated session on `/officer.html`: redirect to `/` to log in.
- Governor attempting to set an `admin` role: 403 with explicit message.

## Testing

- `node --check` on all touched files; server boot check.
- Permission matrix probe: unauthenticated 401s; role checks enforced at the
  middleware level (verified by code path and by 401/403 shape without live
  user JWTs for each role).
- Manual QA: governor/cashier/admin login on both surfaces; cashier blocked
  from People mutations; console flows mirror the main-app equivalents.

## Non-Goals

- No officer-term/rotation management (yearly turnover is manual re-assignment).
- No theme toggle in the console (fixed professional theme in v1).
- No new notification channels; existing email flows unchanged.
- No Electron/desktop packaging.
