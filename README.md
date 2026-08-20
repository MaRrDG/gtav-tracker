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
       cp -r /tmp/gtav-tiles/tiles/atlas public/tiles

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

## Rebuilding the catalog

    curl -sLO https://raw.githubusercontent.com/Mobius1/collectathon/master/collectathon/config.lua
    curl -sL -o markers.json https://raw.githubusercontent.com/danharper/GTAV/master/locations.json
    npx tsx tools/build-catalog.ts config.lua markers.json
    npx tsx tools/validate.ts

Two sources, treated differently on purpose. Collectathon publishes GTA V game world
coordinates, which are canonical, so it supplies every category it covers. The older marker
set was placed by hand on a different map, so it is used only for Stunt Jumps, Knife
Flights and Under the Bridge, which nothing else publishes.

Both are calibrated onto our tiles by fitted transforms rather than guesses:

    node tools/calibrate-game-coords.mjs config.lua   # game coordinates, ~12 m residual
    node tools/fit-alignment.mjs                      # the hand-placed marker set
    node tools/preview-alignment.mjs 1 0 0 check.jpg  # renders the result to look at

## Credits

Collectible coordinates from [Mobius1/collectathon](https://github.com/Mobius1/collectathon)
(GPL-3.0) and [danharper/GTAV](https://github.com/danharper/GTAV) (WTFPL).
Map tiles from [meesvrh/GTAV-Map-Tiles](https://github.com/meesvrh/GTAV-Map-Tiles); the
artwork is Rockstar's.
