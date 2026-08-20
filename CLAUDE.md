# gta5-tracker — project instructions

## Language

Everything written into the repository is in **English**: code, comments, identifiers,
commit messages, documentation, UI copy. Chat with the user happens in Romanian; nothing
Romanian is committed.

## Git

- **No `Co-Authored-By` trailer** in commit messages. No `🤖 Generated with...` line.
  A commit message says what changed and why, nothing else.
- Message format: `type(scope): subject` — e.g. `feat(map): render objective markers`.
- Working branch is `dev`. There is no `main`. Never `git push` — the user pushes.

## Stack

- Next.js (App Router) + TypeScript.
- Supabase Cloud for authentication and Postgres. Not self-hosted.
- The browser never queries Supabase for application data; it goes through this app's
  own API routes. Row-level security stays on as defense in depth.
- Deployment is Docker + docker-compose on the user's own host.
