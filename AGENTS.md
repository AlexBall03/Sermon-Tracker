<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sermon Tracker project notes

- Read `ARCHITECTURE.md` first; it is the technical source of truth. Current status and next steps: `docs/ROADMAP.md`, `docs/HANDOFF-1B.md`, `docs/HANDOFF-1B.1.md`, `docs/HANDOFF-1B.2.md`, `docs/HANDOFF-1C.1.md`.
- Stay inside the current phase. Do not build later-phase features early.
- The repository owner manages Git. Run read-only Git commands only: no commit, stage, branch, push, pull, or config changes.
- Stop every dev, preview, or test server you start before finishing. Never kill processes you did not start.
- The repository is public. No secrets anywhere.
- Use semantic design tokens from `src/app/globals.css`; no hardcoded brand colours in components. The interface is neutral: emerald is for actions, selection, and focus, not for surfaces.
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, commit the SQL. Never `drizzle-kit push`, never hand-edit an applied migration, never run `db:migrate:prod` or `db:stamp`. Production is migrated by its own deployment during `npm run build` (see `docs/DATABASE.md`), so every migration must work with the code already live.
- Every page under `(app)` and every server action checks access itself with the helpers in `src/features/auth/access.ts`. The proxy is routing only.
- `npm run dev` needs a development database. Use `npm run dev:next` when none is configured.
