# GTA V Completion Tracker

Tracks GTA V 100% completion and achievements against a signed-in account.

## Requirements

- Node 22 and npm, or Docker
- A Supabase Cloud project

## Setup

1. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key
   from Supabase → Project settings → API, plus the public origin of the deployment.

2. Apply `supabase/migrations/0001_progress.sql` in the Supabase SQL editor.

3. Configure Supabase → Authentication → URL configuration:

   - Site URL: `https://gtav-tracker.mario-theodor.ro`
   - Redirect URLs: `https://gtav-tracker.mario-theodor.ro/auth/callback` and, for local
     work, `http://localhost:3000/auth/callback`

   Email confirmation stays on. A new account receives a link that returns to
   `/auth/callback`, which exchanges the code for a session.

4. Fetch the map tiles, which are not committed:

       git clone --depth 1 https://github.com/meesvrh/GTAV-Map-Tiles /tmp/gtav-tiles
       cp -r /tmp/gtav-tiles/tiles/atlas tiles

## Run

Development:

    npm install
    npm run dev

With Docker:

    docker compose --env-file .env.local up --build

The app listens on port 3000. `NEXT_PUBLIC_SITE_URL` must be the public origin, because
the confirmation links are built from it.

## Develop

    npx vitest run              # unit tests
    npx tsx tools/validate.ts   # catalog integrity
    npm run build               # production build

## How data is split

The catalog — categories, objectives, achievements — is static JSON in `data/`, versioned
in git. It is identical for every user and changes only when the repository does.

Per-user progress lives in Supabase Postgres, one row per completed objective, protected
by row-level security. The browser reaches progress only through this app's `/api` routes;
it talks to Supabase directly for authentication alone.

## Credits

Coordinates adapted from [danharper/GTAV](https://github.com/danharper/GTAV) (WTFPL).
Map tiles from [meesvrh/GTAV-Map-Tiles](https://github.com/meesvrh/GTAV-Map-Tiles); the
artwork is Rockstar's.
