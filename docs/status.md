# Project status

Last updated: 2026-08-20, end of the first working session.

## Where things stand

Phase 1 (foundations) is complete. Phase 2 (map and collectibles) is built and committed,
but only partly verified: the automated checks pass, and the map was inspected through
rendered previews, but nobody has yet clicked through the running app end to end.

Branch `dev`, 15 commits, nothing uncommitted. Remote `origin` is set to
`git@github.com:MaRrDG/gtav-tracker.git` and has never been pushed. Pushing is the user's
call.

## Verified, with evidence

- `npx vitest run` — 52 tests pass across 8 files.
- `npx tsx tools/validate.ts` — 298 objectives across 9 categories, every expected total met.
- `npx tsc --noEmit` — clean.
- `npm run build` — production build succeeds.
- Auth: sign up, sign in, reload, sign out all behave; the redirect to `/sign-in` was
  confirmed by request, and the user signed in successfully in their own browser.
- Map placement: checked by rendering all 298 objectives onto the tiles and looking at the
  result, then by measuring. See "The alignment problem" below.

## Not verified

- **Docker.** `Dockerfile` and `docker-compose.yml` are written but never built: Docker is
  not installed on the development machine. The standalone build output was checked to
  match what the Dockerfile expects, which is as far as it could be taken.
- **The running UI.** The panel, tally strips, category toggles, mobile sheet and the
  completion flourish are all written and compile, but have not been exercised in a browser.
  The Chrome extension was not connected, so no screenshots could be taken directly.
- **The Supabase migration.** `supabase/migrations/0001_progress.sql` was handed to the user
  to run in the SQL editor. Whether it was applied is unconfirmed; if progress fails to save,
  check this first.

## The alignment problem, and how it was solved

This took most of the session and is the part most likely to be misunderstood later.

The imported coordinates come from a project that drew markers on Google Maps with its own
tiles, which placed the GTA V map in a different part of the world square than the Leaflet
tiles this app uses. Every pin landed in the ocean.

Two wrong approaches were tried and discarded, both recorded here so nobody repeats them:

1. **Maximising "objectives on land" with a free scale.** Degenerate: shrink the data enough
   and every point lands on some patch of land, scoring perfectly while being wrong.
2. **Fitting the game-coordinate mapping against our own data.** Circular: that data had
   itself been fitted, so the fit reproduced its error. The result was about nine percent
   short and shifted north west, which is what the user saw on screen.

The answer was to stop fitting and find the published constant.
[gta-v-map-leaflet](https://github.com/RiceaRaul/gta-v-map-leaflet) defines the GTA V CRS for
exactly these tiles as `L.Transformation(0.02072, 117.3, -0.0205, 172.8)` over game x and y.
Game coordinates now use it directly.

The hand-placed marker set still needs a fitted transform, because nothing published
describes it, but it is fitted against known-good positions: the 140 points it shares with
the canonical source. `tools/calibrate-markers.mjs` reports a median residual of 19 metres,
which is mostly the imprecision of the original hand placement.

**Final check on the result:** with the scale fixed and only the two offsets free, scored on
a two-sided constraint that cannot be cheated (letter scraps and stunt jumps must be ashore,
nuclear waste and submarine parts must be at sea), the best available correction is 15 metres
west and 9 metres north, about 6 pixels at zoom 4. That is within noise, so no correction was
applied. Run `node tools/refine-offset.mjs` to reproduce.

The user still perceived a difference against IGN's map when the session ended. That was not
resolved. The two screenshots compared were panned differently and our tiles stop at zoom 5,
which makes a side-by-side at high zoom unreliable. It may also be a genuine per-pin
difference between two independently surveyed datasets. **The open question is whether any
real discrepancy remains.** The way to settle it: pick one named objective, find it on both
maps, and compare.

## Data

The catalog is static JSON in `data/`, versioned in git. Per-user progress lives in Supabase.

| Category | Count | Source |
| --- | --- | --- |
| Spaceship Parts | 50 | game coordinates |
| Letter Scraps | 50 | game coordinates |
| Nuclear Waste | 30 | game coordinates |
| Epsilon Tracts | 10 | game coordinates |
| Submarine Parts | 30 | game coordinates |
| Hidden Packages | 13 | game coordinates |
| Stunt Jumps | 50 | hand-placed markers |
| Knife Flights | 15 | hand-placed markers |
| Under the Bridge | 50 | hand-placed markers |

Rebuild with `npx tsx tools/build-catalog.ts <config.lua> <markers.json>`; see the README for
the fetch commands.

### Sourcing, and a boundary that was set

The user asked several times to extract IGN's marker database, which holds 2,110 markers.
That was declined: a publicly readable API is not a licence, and in the EU the sui generis
database right protects substantial extraction from a database even where the individual
facts are not copyrightable. The offer made instead, and still open: if the user supplies a
file they have the right to use, the importer is quick to write, and the calibration tools
make placing it verifiable.

Missing relative to a full 100% list: missions, Random Events, Strangers & Freaks, Peyote
Plants, Monkey Mosaics, Action Figures. No open source has been found for these. Note that
roughly half of IGN's 2,110 is GTA Online content and another chunk is shops and ATMs, none
of which counts toward completion; the real 100% list is nearer 500 objectives.

## Design decisions worth keeping

- **Square corners everywhere**, `border-radius: 0`. The game's HUD is angular and it keeps
  the interface from reading as a generic rounded-card template.
- **One accent, orange**, in both themes. An earlier palette used teal with per-protagonist
  colours; that was dropped when the user asked for a single orange primary.
- **The tally strip replaces the progress bar** rather than sitting beside it. One cell per
  objective, so it shows which are missing, not just how many. Clicking a cell flies there.
- **Motion is budgeted and justified.** Popup 160ms, tally fill 120ms colour only, mobile
  sheet 300ms, fly-to 600ms. Category toggles deliberately do not animate: they are used
  dozens of times a session. One flourish, at 100%, because it happens once per save.
- **The catalog is files, not database rows.** It is identical for every user and changes
  only when the repository does, so a change to it is a diff you can read.
- **The browser never queries Supabase for application data**, only for auth. Everything
  else goes through this app's `/api` routes, with row-level security on underneath.

## Next steps, in order

1. **Settle the placement question** with a single named objective compared on both maps.
2. **Walk the running app** and confirm the phase 2 acceptance list in
   `docs/superpowers/plans/2026-08-20-phase2-map.md`.
3. **The IGN-style panel**, which the user asked for and approved: category groups
   (Collectibles, Activities, Missions, Items, Online), per-group show and hide, and a
   Complete / Incomplete summary at the top.
4. **Phase 3**: objectives without a location, the achievements panel and its automatic
   rules, per-category reset.
5. **Phase 4**: the pin editor at `?edit=1`, then fill the missing categories.

## Gotchas

- `tsx` runs these files as CommonJS, so **top-level await fails** in `tools/*.ts`. Use
  `main().catch(...)`.
- A tool module that runs a CLI on import will fire when `build-catalog.ts` imports it. Guard
  on `process.argv[1]` ending with the file name, not merely on an argument being present.
- `lib/catalog.ts` imports the data files at module scope, so a client component must not
  import from it. `indexCatalog` lives in `lib/catalog-index.ts` for that reason.
- `process.env` must be read as a **static property** for Next to inline it into the client
  bundle. `process.env[name]` silently yields undefined in the browser. See `lib/env.ts`.
- Next 16 renamed `middleware.ts` to `proxy.ts`, and the exported function to `proxy`.
- Tiles live in `public/tiles`, are gitignored, and are Rockstar artwork. They are mounted
  into the container rather than baked into the image.
- The golden values in `tests/import.test.ts` and `tests/import-collectathon.test.ts` pin the
  coordinate transforms. If they fail, a transform changed. That is the point: it should be a
  deliberate edit, not a silent shift of every pin on the map.
