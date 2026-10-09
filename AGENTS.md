<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sermon Tracker project notes

- Read `ARCHITECTURE.md` first; it is the technical source of truth. Current status and next steps: `docs/ROADMAP.md`, `docs/HANDOFF-1A.md`.
- Stay inside the current phase. Do not build later-phase features early.
- The repository owner manages Git. Run read-only Git commands only: no commit, stage, branch, push, pull, or config changes.
- Stop every dev, preview, or test server you start before finishing. Never kill processes you did not start.
- The repository is public. No secrets anywhere.
- Use semantic design tokens from `src/app/globals.css`; no hardcoded brand colours in components.
