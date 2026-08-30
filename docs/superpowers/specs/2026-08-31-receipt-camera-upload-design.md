# In-System Camera Receipt Capture and Upload - Design

Date: 2026-08-31
Status: Approved (design), pending spec review

## Problem

Receipts are the audit backbone of the LGU transparency system, but today admins
paste Google Drive links into the Add Transaction form. Drive links break, leak
permissions, and take students off-platform. Supabase's free 1 GB storage tier
is unused.

## Goal

Admins capture a receipt photo in-system with a camera interface, review it
(submit or retake), and on submit it is compressed client-side and stored in a
private Supabase Storage bucket, sized so the free 1 GB tier lasts.

## Decisions Made

- Attach point: the camera flow lives **inside the Add Transaction form**,
  replacing the Google Drive URL input. Old records with Drive links keep
  rendering unchanged. (Retroactive per-row receipt attachment was considered
  and deferred.)
- Capture is **camera-first with a file-picker fallback** for desktop admins
  without webcams and for scanned PDFs. Same pipeline either way.
- Upload path: **through the Express server** (multer, already a dependency),
  not client-to-Supabase-direct. The browser never talks to Supabase;
  auth, validation, and audit stay in the existing middleware chain. The 50 kb
  JSON body limit also rules out base64 uploads.
- Compression: **client-side canvas** (zero new dependencies, saves bandwidth),
  with a server-side hard size cap as backstop. Server-side sharp
  re-compression was considered and skipped (devDependency, not needed).
- Bucket visibility: **private**, with **signed URLs** generated per read.
  Receipts are financial documents; public URLs would be permanent and ungated.

## UX Flow

1. Add Transaction form: the receipt URL input is replaced by an
   **"Add Receipt"** button (camera icon).
2. Clicking opens a modal with a live camera preview (`getUserMedia`,
   rear camera preferred via `facingMode: 'environment'`).
3. **Capture** snaps a frame to a frozen preview.
4. Below the frozen frame: **"Submit Receipt"** or **"Take Photo Again"**.
   Retake re-arms the live camera. Nothing is stored until submit.
5. A smaller **"Choose File"** link sits next to the camera button as fallback
   (images or PDF, max 5 MB).
6. Once attached, the control shows a chip (file name + compressed size) with
   an x to remove and start over.
7. Camera stream is stopped when the modal closes (any path: submit, cancel,
   remove, view switch).

## Architecture

| Component | Responsibility |
| --- | --- |
| `client/js/receipt-capture.js` (new) | Modal lifecycle, getUserMedia preview, capture, review/retake, canvas compression, file picker, returns a `Blob` + display name to the caller |
| Add Transaction form (`admin.js`, `index.html`) | Builds `FormData` (transaction fields + optional receipt) instead of JSON; shows attachment chip |
| `POST /api/transactions` (`server/routes/transactions.js`) | Conditionally parses `multipart/form-data` via multer memory storage; JSON requests continue through the existing `express.json` parser unchanged |
| Upload handler (server) | After the transaction row is inserted, uploads the file to storage path `receipts/{event_id}/{transaction_id}.{ext}` with the service key, then updates `receipt_url` on the row |
| Migration `015_receipts_bucket.sql` | Creates the private `receipts` bucket (5 MB file limit; JPEG/PNG/WebP/PDF only), re-runnable via `ON CONFLICT DO NOTHING` |
| `GET /api/events/:id` | Rewrites stored storage paths into 1-hour signed URLs before responding; non-storage values (legacy Drive links) pass through untouched |

No storage RLS policies are needed: the bucket is private and every read/write
goes through the service key on the server, behind existing auth middleware.

## Compression Spec

- Source: captured frame drawn to canvas, or the chosen image file.
- Downscale so the long edge is at most 1600 px.
- Encode JPEG quality 0.7. If the result exceeds 400 KB, retry once at long
  edge 1200 px / quality 0.5.
- Expected result: 100-400 KB per phone-photo receipt (~2,000-5,000 receipts
  within the 1 GB budget alongside posters/avatars planned later).
- PDFs skip compression; the 5 MB server cap applies.
- Server rejects > 5 MB or non-whitelisted MIME types with a specific error.

## Data Flow

1. Admin fills the form, captures (or picks) a receipt, submits.
2. Client sends `multipart/form-data`: transaction fields + `receipt` blob.
3. Server validates fields (existing rules), inserts the transaction row.
4. Server uploads the blob to `receipts/{event_id}/{transaction_id}.{ext}`
   (`jpg` for camera captures; the original extension for fallback files) and
   patches `receipt_url` with the storage path (not a signed URL).
5. Student/admin opens the event detail; server signs each storage-path
   receipt for 1 hour and returns the URL; the existing receipt link in the
   transaction history just works.

## Error Handling

- **No camera / permission denied:** modal shows an explanatory message and
  highlights the file-picker fallback automatically.
- **Storage upload fails after row insert:** the transaction is NOT lost. Row
  is saved with `receipt_url = null`; response is 201 with a `warning` field
  ("Transaction saved, but receipt upload failed"); the failure is logged.
  No duplicate-charge retry risk.
- **Oversized or wrong-type file:** rejected before any DB write, with a
  message naming the limit.
- **Modal closed mid-capture:** camera tracks stopped; nothing persisted.

## Non-Goals

- No officer role: the system has only `admin`/`student`; the flow is
  admin-only via existing `requireAdmin`.
- No retroactive per-row receipt attachment (deferred; rows without receipts
  can be re-logged if needed).
- No migration of existing Google Drive receipts.
- No event posters/avatars in this spec (separate future feature on the same
  bucket model).

## Testing

- Syntax checks on all touched JS; server boots cleanly.
- Route-level check: `POST /api/transactions` without auth returns 401;
  multipart with auth is covered by manual QA.
- Manual QA script: capture on phone/webcam -> chip shows compressed size ->
  submit -> transaction appears with receipt link -> link opens the image from
  storage -> retake path never stores -> desktop file fallback with a PDF.
- Regression: legacy Drive-link receipts still render in event detail.

## Rollout

1. Apply migration 015 to Supabase (same process as migration 014; SQL Editor
   paste works).
2. Deploy server (multer endpoint + signed URL rewrite) and client
   (camera modal + FormData form) together; old clients keep posting JSON
   which the server still parses correctly.
