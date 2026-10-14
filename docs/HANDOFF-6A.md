# Handoff — Phase 6A: Contact & Feedback

## What exists

- **Public contact** at `/contact` (footer link, in the sitemap). Name, email, subject, message. Server-validated (`supportSchemas`), honeypot field, minimum fill time, rate limited in the database (3/hour per email and per hashed network address), duplicate submissions within 10 minutes return the first ticket.
- **Help & Feedback** at `/support` (account menu, mobile account sheet, Settings overview): bug reports, feature requests, feedback, and contact, with category fields, up to 3 screenshots, history, unread replies, replies, and close. The account always comes from `authorize("active")`.
- **Admin inbox** at `/admin/feedback` (card on `/admin`): search, kind/status/source filters, order, paging in the address; detail page with metadata, screenshots, status (only the kind's statuses), history, public replies and internal notes.
- **Statuses** by kind (`statusesFor`, `features/support/model.ts`): contact open/resolved/closed; bug adds under review and in progress; feature adds planned; feedback open/under review/closed. A requester's reply reopens a finished ticket.

## Rules

- `features/support/tickets.ts` is the only code that reads or writes the four `support_*` tables (migration `0017`). Account queries filter by the account in their WHERE clause; `admin…` functions are called only after `authorize("admin")`/`requireAdmin()`.
- Internal notes (`visibility = 'internal'`) are left out by the requester's query and never mailed.
- Screenshots: uploaded to `POST /api/support/attachments` (type from magic bytes: PNG, JPEG, WebP; 4 MB), stored in a **private** Blob store, served only by `GET /api/support/attachments/<id>` to the owner or an administrator (once attached). Unattached uploads older than a day are deleted on the owner's next upload.
- Mail (`email.ts`, Resend) is sent after the save and never decides success; each mail carries an idempotency key per event. Public acknowledgments repeat nothing the sender typed. Without configuration nothing is mailed.
- Text is rendered as text (`whitespace-pre-wrap`), mail HTML is escaped.

## Not done here

Notification preferences and push (7C). No scheduled orphan sweep beyond the per-upload clean-up. Signed-in pages were verified by unit tests, not in a browser.
