# GTA V 100% Completion Tracker — Design

Date: 2026-08-20
Status: approved. Revised after the decision to add user accounts.

## Purpose

A tracker for everything required to finish GTA V: the 100% completion checklist plus
all achievements. A signed-in user marks objectives as done and sees, at a glance, what
remains and where it is on the map. Progress follows the account, so the same state is
available from any device.

## Why not the embedded iframe

The original idea was to drive `gta-5-map.com`'s embedded map — toggling its layers and
reading its markers from the surrounding page. That is not possible. The iframe is a
different origin, so same-origin policy blocks all DOM and script access from our page,
and the site exposes no `postMessage` API. Any interaction between map and tracker
requires the map to be ours.

The app therefore renders its own Leaflet map over GTA V map tiles.

## Scope

In scope:

- Collectibles: Spaceship Parts, Letter Scraps, Nuclear Waste, Submarine Pieces,
  Epsilon Tracts, Stunt Jumps, Under the Bridge, Knife Flights.
- Missions, Strangers & Freaks, Hobbies & Pastimes, Random Events.
- 100% completion requirements that have no map location.
- All achievements, single-player and Online.
- Email and password accounts, with progress stored per account.

Out of scope:

- Reproducing the game's internal completion percentage formula. See "Progress model".
- Guest mode. An account is required. Supporting both an anonymous local state and an
  account state means writing and reconciling two sources of truth, for a feature nobody
  asked for. If it is wanted later, it is a merge-on-signup feature, planned then.
- Social login, teams, roles. Email and password covers the need.

## Architecture

Next.js (App Router) with TypeScript. Supabase Cloud provides authentication and
Postgres. The app is packaged with Docker and runs under docker-compose on the user's
own host.

```
gta5-tracker/
  app/
    layout.tsx, page.tsx            map screen, requires a session
    sign-in/page.tsx                sign-in and sign-up
    api/
      catalog/route.ts              GET  the objective catalog
      progress/route.ts             GET  the signed-in user's progress
                                    DELETE reset a set of objectives
      progress/[id]/route.ts        PUT  mark one objective done or not done
  components/
    map-view.tsx                    Leaflet map, markers, fly-to
    sidebar.tsx                     categories, visibility toggles, counters
    tally.tsx                       the tally strip
  lib/
    catalog.ts                      loads and indexes the static data files
    progress-client.ts              browser-side API client
    supabase/server.ts, client.ts   Supabase clients for server and browser
  data/
    categories.json, locations.json, achievements.json
  supabase/migrations/              SQL schema, applied to Supabase Cloud
  tools/
    validate.ts                     data integrity checks
    import-danharper.ts             converts the upstream dataset
  public/tiles/                     map tiles, mounted at runtime, not committed
  Dockerfile, docker-compose.yml
```

Leaflet uses its default CRS (EPSG3857), not `CRS.Simple`. The
[danharper/GTAV](https://github.com/danharper/GTAV) dataset (WTFPL) stores coordinates
in the standard Mercator range, so under the default CRS its values import without
conversion, while `CRS.Simple` would misplace every pin.

Tiles come from [meesvrh/GTAV-Map-Tiles](https://github.com/meesvrh/GTAV-Map-Tiles),
`{z}/{x}/{y}.jpg`, zoom 0-5, `atlas` style — the light stylized map this design is built
around. The tiles are Rockstar artwork. They are mounted into the container as a volume
rather than baked into the image, so the image can be rebuilt and moved without
redistributing the artwork.

### Two kinds of data

The **catalog** — categories, objectives, achievements — is static, identical for every
user, and versioned in git as JSON. It is not in the database: it changes when we edit
it, not when a user acts, and keeping it in files makes review a diff.

**Progress** is per user and lives in Postgres.

### Why the app has its own API

Supabase could be queried straight from the browser. It is not, for two reasons: a
single place to change how progress is read and written, and an API surface a future
client can use. Row-level security stays enabled anyway, so a leaked key still cannot
read another user's rows.

## Data model

One shape for every objective, so map and checklist read the same source:

```json
{
  "id": "spaceship-01",
  "cat": "spaceship",
  "name": "Spaceship Part #1",
  "lat": 83.147,
  "lng": -120.586,
  "notes": "Mount Chiliad, near the barns",
  "counts_for": ["100%", "ach:from-beyond-the-stars"]
}
```

- Missing `lat`/`lng` means the objective appears only in the checklist panel.
- `counts_for` links an objective to the 100% list and to any achievement it feeds.
- Missions and Strangers & Freaks carry an optional `protagonist` field
  (`michael` | `franklin` | `trevor`), used for both filtering and color.

Achievements:

```json
{
  "id": "from-beyond-the-stars",
  "name": "From Beyond the Stars",
  "desc": "Collect and return all spaceship parts.",
  "platform": "sp",
  "auto": { "cat": "spaceship", "require": "all" }
}
```

An achievement with an `auto` rule is checked automatically when the rule is satisfied
and cannot be toggled by hand. Achievements without a rule are manual.

### Database schema

```sql
create table public.progress (
  user_id      uuid not null references auth.users on delete cascade,
  objective_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, objective_id)
);

alter table public.progress enable row level security;

create policy "own rows" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

A row exists only for a completed objective; absence means not done. `objective_id` is
deliberately not a foreign key — the catalog lives in files, so there is no table to
reference. A stale row for a renamed objective is harmless and recoverable.

### API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/catalog` | GET | The catalog: categories, objectives, achievements |
| `/api/progress` | GET | `{ done: { "<id>": "<ISO timestamp>" } }` for the signed-in user |
| `/api/progress` | DELETE | Body `{ ids: string[] }` — reset those objectives |
| `/api/progress/[id]` | PUT | Body `{ done: boolean }` — mark one objective |

Every progress route requires a session and answers `401` without one. An unknown
objective id answers `404`, so a typo fails loudly instead of writing a row nobody reads.

### Data sourcing

Confirmed available from danharper/GTAV: 50 Spaceship Parts, 50 Letter Scraps, 30
Nuclear Waste, 50 Stunt Jumps, Knife Flights. To be sourced or entered with the pin
editor: Submarine Pieces, Epsilon Tracts, Under the Bridge, Strangers & Freaks,
missions, Random Events, Hobbies. Every import runs through `tools/validate.ts` before
it is committed.

## Progress model

The app does not emulate the game's internal completion percentage. That formula is
undocumented, weighted, and unverifiable from outside the game; a number that looks
official but is wrong is worse than no number.

Instead: per-category progress as done over total, an overall figure labeled as the
tracker's own count rather than the game's, the official Rockstar 100% criteria as their
own checkable section, and a separate readout for achievements.

## UI

Full-bleed map. Opaque panel docked left, roughly 340px, full height, hard edge.

Panel contents, top to bottom: overall completion as a percentage in large display type
with the global tally strip as its underline; an achievements readout; the category
list, each row carrying a name, a visibility checkbox, a `12/50` counter and its tally
strip; and a "No location" tab for checklist-only objectives and manual achievements.

Global controls: hide completed objectives, show or hide all categories, and the
signed-in user's email with a sign-out control.

Marker click opens a popup with name, notes, and a "Mark done" button. Completed markers
dim, or disappear when "hide completed" is on.

Copy is plain and active: the button reads "Mark done", the state it produces reads
"Done". Empty states say what to do next. Errors say what happened and what to do: a
failed write reads "Could not save. Retry.", never an apology.

Marking an objective updates the interface immediately and writes to the API in the
background. If the write fails, the change is rolled back and the message appears — the
interface never claims a save that did not happen.

### Signature element: the tally strip

Under each category, a grid of small cells, one per objective — 50 cells for Spaceship
Parts. A cell fills teal when its objective is done. This shows not just how many are
missing but which ones, and clicking an empty cell flies the map to that pin. It is
taken from the collectible grids in the game's own menus, and it replaces the
conventional progress bar rather than sitting next to one.

### Visual direction

This is dense product UI, not a landing page: a tool kept open for hours while playing.
The visual language comes from the game's own HUD, which is angular, dense, and uses one
accent against neutrals.

**Shape.** Square corners, radius 0, everywhere. It matches the HUD and it keeps the
interface from reading as a generic rounded-card template.

**Color.** One accent, orange, and warm neutrals. Semantic tokens carry the values so a
theme swap changes one block of CSS and nothing else. The orange is darker in the light
theme so white text on it passes contrast, and lighter in the dark theme so it reads
against a dark surface. Both themes ship; the default follows `prefers-color-scheme`.

```
light   --bg #f5f3ef  --surface #ffffff  --text #1b1b1a  --primary #c4550f
dark    --bg #16171a  --surface #1e2023  --text #eceae6  --primary #f2802e
```

No second accent anywhere. The earlier protagonist-color device is dropped: it collided
with the orange and contradicted a single-accent palette.

**Type.** Archivo for headings and category names, uppercase with tight tracking, for its
signage feel. Geist for interface text. Geist Mono, tabular figures, for every number, so
counters do not shift width as they change. Icons come from Phosphor; no hand-drawn SVG.

**Motion.** Every animation names a purpose or it is not written.

| Element | Purpose | Recipe |
| --- | --- | --- |
| Marker popup | spatial consistency | 160ms ease-out, opacity and scale 0.96, origin at the pin |
| Tally cell fill | feedback | 120ms, color only |
| Mobile panel | spatial consistency | 300ms drawer curve, transform only |
| Fly-to from a tally cell | spatial consistency | 600ms, replaced by an instant jump under reduced motion |
| Sign-in entry | first impression, once per session | opacity and 8px rise, 200ms, 40ms stagger |

Deliberately not animated: counters counting up, which is decoration over data being read;
category visibility toggles, which are used dozens of times per session and would grow
tiresome; and anything looping. One delight moment is allowed, at 100% completion, because
it happens once per save.

Hover motion is gated behind `(hover: hover) and (pointer: fine)`. Reduced motion keeps
opacity and color transitions and drops movement.

Quality floor: responsive down to mobile, where the panel becomes a bottom sheet; visible
keyboard focus on every control; WCAG AA contrast in both themes.

## Deployment

A multi-stage Dockerfile producing a Next.js standalone build. `docker-compose.yml` runs
the app, mounts `./tiles` to `/app/public/tiles` read-only, and reads Supabase
credentials from the environment. There is no database service in the compose file —
Postgres is Supabase Cloud.

Required environment: `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, kept in `.env.local`, which is gitignored;
`.env.example` documents the shape. The publishable key is public by design — it reaches
the browser either way, and row-level security is what actually protects the rows. The
secret key and the database password are never used by this app: every write happens as
the signed-in user, so the policy applies to it.

## Pin editor

Enabled at `/editor` for a signed-in user. Select a category, click the map to place a
pin, edit name and notes, then export an updated `locations.json` to commit. It produces
a file to download, not database rows — the catalog is versioned in git.

## Testing

Vitest for unit tests. `tools/validate.ts` is written before the first import so the
import is verified rather than assumed: unique ids, known categories, per-category counts
against expected totals, coordinates within map bounds, and every `counts_for` and `auto`
reference resolving. API route handlers are tested against a stubbed Supabase client for
the cases that matter: no session, unknown objective, successful write.

Map and DOM behavior is verified by hand against the running app.

## Delivery phases

1. **Foundations.** Next.js app, Dockerfile and compose, Supabase auth with sign-in and
   sign-up, the schema and its policy, the catalog API, the progress API. Ends with a
   signed-in user able to store and read progress through the API.
2. **Map and collectibles.** Leaflet over the tiles, markers, category toggles, marking
   done, sidebar counters, tally strips. Ends with the app usable.
3. **Checklist and achievements.** Non-map objectives, the achievements panel, automatic
   completion rules, per-category reset.
4. **Pin editor and remaining categories.** Editor, then Submarine Pieces, Epsilon
   Tracts, Under the Bridge, Strangers & Freaks, missions, Random Events, Hobbies.

## Carried over from the pre-accounts design

The catalog data files, `tools/validate.ts` and `tools/import-danharper.ts` survive the
change to Next.js unaltered in substance; they are ported from JavaScript to TypeScript.
Nothing else had been built when the architecture changed.
