# Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can read the objective catalog and store their completion progress through this app's own API, running in Docker against Supabase Cloud.

**Architecture:** Next.js App Router with TypeScript. The catalog is static JSON bundled with the app; progress is per-user rows in Supabase Postgres, protected by row-level security. The browser never talks to Supabase for application data — it calls this app's route handlers, which act as the signed-in user. Auth uses `@supabase/ssr` with cookie-based sessions refreshed in middleware.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@supabase/ssr` 0.12 with `@supabase/supabase-js` 2, Vitest 4, Docker with a standalone Next build.

**Spec:** `docs/superpowers/specs/2026-08-20-gta5-tracker-design.md`

## Global Constraints

- Everything written into the repository is English: code, comments, commit messages, UI copy.
- No `Co-Authored-By` trailer and no generated-with line in commit messages. Format: `type(scope): subject`.
- Working branch is `dev`. There is no `main`. Never `git push`.
- Secrets: only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used, from `.env.local`, which is gitignored. Never use the Supabase secret key or the database password in application code.
- Every progress route requires a session and answers `401` without one; an objective id absent from the catalog answers `404`.
- Objective id format: `<cat>-<NN>`, zero-padded to two digits, e.g. `spaceship-01`.
- Tests run with `npx vitest run`. Test files live beside no source; they go in `tests/`.
- Palette tokens, exact values: `--sand #EDE6D6`, `--asphalt #1E2422`, `--teal #35B0A7`, `--olive #B9CE8E`, `--freeway #E9D48A`.
- UI copy is active and consistent: the button reads `Mark done`, the state reads `Done`, a failed write reads `Could not save. Retry.`

## File Structure

| Path | Responsibility |
| --- | --- |
| `app/layout.tsx` | Root layout, fonts, global styles |
| `app/page.tsx` | Map screen. Phase 1 leaves it a placeholder that proves the session |
| `app/sign-in/page.tsx` | Sign in and sign up |
| `app/auth/sign-out/route.ts` | Ends the session and redirects |
| `app/api/catalog/route.ts` | Serves the catalog |
| `app/api/progress/route.ts` | Reads all progress, resets a set |
| `app/api/progress/[id]/route.ts` | Marks one objective |
| `lib/types.ts` | Catalog and progress types, shared by app and tools |
| `lib/catalog.ts` | Loads and indexes the static catalog |
| `lib/supabase/server.ts` | Server-side Supabase client bound to request cookies |
| `lib/supabase/client.ts` | Browser Supabase client, used only for auth |
| `middleware.ts` | Refreshes the session cookie on every request |
| `data/*.json` | The catalog |
| `supabase/migrations/0001_progress.sql` | Table, RLS, policy |
| `tools/validate.ts` | Data integrity checks |
| `tools/import-danharper.ts` | Converts the upstream dataset |
| `tests/*.test.ts` | Unit tests |
| `tests/helpers/supabase.ts` | Fake Supabase client for route tests |
| `Dockerfile`, `docker-compose.yml` | Deployment |

**Already in the repository from before the pivot:** `data/categories.json`, `data/achievements.json`, `tools/validate.js`, `tests/validate.test.js`, `CLAUDE.md`, `.env.local`, `.env.example`, `.gitignore`. Task 1 ports the JavaScript tooling to TypeScript; the JSON data stays as it is.

---

### Task 1: Next.js scaffold and the catalog in TypeScript

**Files:**
- Create: `app/`, `lib/types.ts`, `lib/catalog.ts`, `tools/validate.ts`, `vitest.config.ts`
- Delete: `tools/validate.js`, `tests/validate.test.js`
- Test: `tests/validate.test.ts`, `tests/catalog.test.ts`

**Interfaces:**
- Consumes: `data/categories.json` and `data/achievements.json`, already present.
- Produces: types `Category`, `Objective`, `Achievement`, `Catalog`, `IndexedCatalog`; `validateData(catalog)` returning `string[]`; `getCatalog()` returning `Catalog`; `indexCatalog(catalog)` returning `IndexedCatalog`.

- [ ] **Step 1: Scaffold the Next.js app in place**

The repository is not empty, so scaffold into a temporary directory and move the parts in.

```bash
npx --yes create-next-app@latest .next-scaffold \
  --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm
cp -r .next-scaffold/app .
cp .next-scaffold/tsconfig.json .next-scaffold/next.config.* .next-scaffold/eslint.config.* .
node -e "
const fs=require('fs');
const mine=JSON.parse(fs.readFileSync('package.json','utf8'));
const gen=JSON.parse(fs.readFileSync('.next-scaffold/package.json','utf8'));
gen.name=mine.name; gen.private=true;
gen.scripts={...gen.scripts, test:'vitest run', validate:'tsx tools/validate.ts'};
fs.writeFileSync('package.json', JSON.stringify(gen,null,2)+'\n');
"
rm -rf .next-scaffold
npm install
npm install --save-dev vitest tsx @types/node
```

The merge keeps the project name and adds the `test` and `validate` scripts to whatever `create-next-app` generated. Delete `app/page.module.css` and the boilerplate body of `app/page.tsx`; Task 4 replaces them.

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
```

- [ ] **Step 3: Write the types**

Create `lib/types.ts`:

```ts
export type Protagonist = 'michael' | 'franklin' | 'trevor';

export type Category = {
  id: string;
  name: string;
  /** Known total for the category, or null when it is not known yet. */
  expected: number | null;
};

export type Objective = {
  id: string;
  cat: string;
  name: string;
  /** Absent for objectives that are checklist-only. */
  lat?: number;
  lng?: number;
  notes: string;
  counts_for: string[];
  protagonist?: Protagonist;
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  platform: 'sp' | 'online';
  /** Present when the achievement completes itself from a category. */
  auto?: { cat: string; require: 'all' };
};

export type Catalog = {
  categories: Category[];
  locations: Objective[];
  achievements: Achievement[];
};

export type IndexedCatalog = Catalog & {
  byId: Map<string, Objective>;
  byCategory: Map<string, Objective[]>;
};

/** Completion timestamps keyed by objective id, as returned by the API. */
export type ProgressMap = Record<string, string>;
```

- [ ] **Step 4: Port the validator test to TypeScript**

Delete `tests/validate.test.js` and `tools/validate.js`, then create `tests/validate.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { validateData } from '@/tools/validate';
import type { Achievement, Category, Objective } from '@/lib/types';

const categories: Category[] = [
  { id: 'spaceship', name: 'Spaceship Parts', expected: 2 },
  { id: 'knife', name: 'Knife Flights', expected: null },
];

const achievements: Achievement[] = [
  { id: 'from-beyond-the-stars', name: 'From Beyond the Stars', desc: '', platform: 'sp',
    auto: { cat: 'spaceship', require: 'all' } },
];

const loc = (over: Partial<Objective> = {}): Objective => ({
  id: 'spaceship-01', cat: 'spaceship', name: 'Spaceship Part #1',
  lat: 83.1, lng: -120.5, notes: '', counts_for: ['100%'], ...over,
});

const run = (locations: Objective[], achs = achievements) =>
  validateData({ locations, achievements: achs, categories });

describe('validateData', () => {
  test('accepts valid data', () => {
    expect(run([loc(), loc({ id: 'spaceship-02', name: 'Spaceship Part #2' })])).toEqual([]);
  });

  test('rejects duplicate ids', () => {
    const errors = run([loc(), loc()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate id: spaceship-01/);
  });

  test('rejects an unknown category', () => {
    expect(run([loc({ cat: 'peyote' }), loc({ id: 'spaceship-02' })]).join('\n'))
      .toMatch(/unknown category: peyote/);
  });

  test('rejects a category count that misses its expected total', () => {
    expect(run([loc()]).join('\n')).toMatch(/spaceship: expected 2, found 1/);
  });

  test('skips the count check when expected is null', () => {
    expect(run([
      loc(), loc({ id: 'spaceship-02' }),
      { id: 'knife-01', cat: 'knife', name: 'Knife Flight #1', lat: 70, lng: -120, notes: '', counts_for: ['100%'] },
    ])).toEqual([]);
  });

  test('rejects coordinates outside the map bounds', () => {
    expect(run([loc({ lat: 91 }), loc({ id: 'spaceship-02' })]).join('\n'))
      .toMatch(/coordinates out of bounds/);
  });

  test('rejects a counts_for reference to an unknown achievement', () => {
    expect(run([loc({ counts_for: ['100%', 'ach:nope'] }), loc({ id: 'spaceship-02' })]).join('\n'))
      .toMatch(/unknown achievement: nope/);
  });

  test('rejects an achievement rule naming an unknown category', () => {
    const bad: Achievement[] = [{ ...achievements[0], auto: { cat: 'peyote', require: 'all' } }];
    expect(run([loc(), loc({ id: 'spaceship-02' })], bad).join('\n'))
      .toMatch(/unknown category: peyote/);
  });

  test('accepts an objective with no coordinates', () => {
    const checklistOnly: Objective = {
      id: 'spaceship-02', cat: 'spaceship', name: 'Checklist item', notes: '', counts_for: ['100%'],
    };
    expect(run([loc(), checklistOnly])).toEqual([]);
  });
});
```

The last test is new: the pre-pivot validator required coordinates on every objective, but the spec has always allowed checklist-only objectives. This fixes that mismatch now, before phase 3 depends on it.

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL — cannot resolve `@/tools/validate`.

- [ ] **Step 6: Write the validator**

Create `tools/validate.ts`:

```ts
import { readFile } from 'node:fs/promises';
import type { Achievement, Category, Objective } from '@/lib/types';

// Leaflet's default CRS clamps latitude to the Web Mercator limit.
const LAT_LIMIT = 85.06;
const LNG_LIMIT = 180;

type Input = { locations: Objective[]; achievements: Achievement[]; categories: Category[] };

export function validateData({ locations, achievements, categories }: Input): string[] {
  const errors: string[] = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const achievementIds = new Set(achievements.map((a) => a.id));
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const item of locations) {
    const where = item.id || '(missing id)';
    if (!item.id) errors.push('objective with no id');
    else if (seen.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    else seen.add(item.id);

    if (!item.name) errors.push(`${where}: missing name`);

    if (!categoryIds.has(item.cat)) {
      errors.push(`${where}: unknown category: ${item.cat}`);
    } else {
      counts.set(item.cat, (counts.get(item.cat) ?? 0) + 1);
    }

    // Coordinates are optional: an objective without them is checklist-only.
    const hasLat = typeof item.lat === 'number';
    const hasLng = typeof item.lng === 'number';
    if (hasLat !== hasLng) {
      errors.push(`${where}: has only one of lat/lng`);
    } else if (hasLat && hasLng) {
      if (Math.abs(item.lat!) > LAT_LIMIT || Math.abs(item.lng!) > LNG_LIMIT) {
        errors.push(`${where}: coordinates out of bounds (${item.lat}, ${item.lng})`);
      }
    }

    for (const ref of item.counts_for ?? []) {
      if (ref === '100%') continue;
      if (!ref.startsWith('ach:')) {
        errors.push(`${where}: malformed counts_for entry: ${ref}`);
        continue;
      }
      const id = ref.slice(4);
      if (!achievementIds.has(id)) errors.push(`${where}: unknown achievement: ${id}`);
    }
  }

  for (const category of categories) {
    if (category.expected == null) continue;
    const found = counts.get(category.id) ?? 0;
    if (found !== category.expected) {
      errors.push(`${category.id}: expected ${category.expected}, found ${found}`);
    }
  }

  for (const achievement of achievements) {
    if (!achievement.auto) continue;
    if (!categoryIds.has(achievement.auto.cat)) {
      errors.push(`${achievement.id}: unknown category: ${achievement.auto.cat}`);
    }
    if (achievement.auto.require !== 'all') {
      errors.push(`${achievement.id}: unsupported rule: ${achievement.auto.require}`);
    }
  }

  return errors;
}

async function main(): Promise<void> {
  const read = async (name: string) =>
    JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

  const [locations, achievements, categories] = await Promise.all([
    read('locations'), read('achievements'), read('categories'),
  ]);

  const errors = validateData({ locations, achievements, categories });
  if (errors.length > 0) {
    console.error(`${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(`Data is valid: ${locations.length} objectives across ${categories.length} categories.`);
}

// tsx sets argv[1] to this file when it is run directly, not when it is imported.
if (process.argv[1]?.endsWith('validate.ts')) {
  await main();
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/validate.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Write the catalog test**

Create `tests/catalog.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { indexCatalog } from '@/lib/catalog';
import type { Catalog } from '@/lib/types';

const catalog: Catalog = {
  categories: [
    { id: 'spaceship', name: 'Spaceship Parts', expected: 2 },
    { id: 'letter', name: 'Letter Scraps', expected: 1 },
  ],
  achievements: [
    { id: 'from-beyond-the-stars', name: 'From Beyond the Stars', desc: '', platform: 'sp' },
  ],
  locations: [
    { id: 'spaceship-01', cat: 'spaceship', name: 'A', lat: 1, lng: 2, notes: '', counts_for: [] },
    { id: 'letter-01', cat: 'letter', name: 'B', lat: 3, lng: 4, notes: '', counts_for: [] },
    { id: 'spaceship-02', cat: 'spaceship', name: 'C', lat: 5, lng: 6, notes: '', counts_for: [] },
  ],
};

describe('indexCatalog', () => {
  test('indexes objectives by id', () => {
    const indexed = indexCatalog(catalog);
    expect(indexed.byId.get('letter-01')?.name).toBe('B');
    expect(indexed.byId.size).toBe(3);
  });

  test('groups objectives by category, preserving file order', () => {
    const indexed = indexCatalog(catalog);
    expect(indexed.byCategory.get('spaceship')?.map((l) => l.id))
      .toEqual(['spaceship-01', 'spaceship-02']);
  });

  test('gives every declared category an entry, even an empty one', () => {
    const indexed = indexCatalog({ ...catalog, locations: [] });
    expect(indexed.byCategory.get('letter')).toEqual([]);
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run tests/catalog.test.ts`
Expected: FAIL — cannot resolve `@/lib/catalog`.

- [ ] **Step 10: Write the catalog module**

Create `lib/catalog.ts`:

```ts
import categories from '@/data/categories.json';
import achievements from '@/data/achievements.json';
import locations from '@/data/locations.json';
import type { Achievement, Catalog, Category, IndexedCatalog, Objective } from '@/lib/types';

/**
 * The catalog is bundled rather than read from disk: it is identical for every user and
 * changes only when the repository does, so it needs no I/O at request time.
 */
export function getCatalog(): Catalog {
  return {
    categories: categories as Category[],
    achievements: achievements as Achievement[],
    locations: locations as Objective[],
  };
}

export function indexCatalog(catalog: Catalog): IndexedCatalog {
  const byId = new Map<string, Objective>();
  const byCategory = new Map<string, Objective[]>(
    catalog.categories.map((category) => [category.id, []]),
  );

  for (const objective of catalog.locations) {
    byId.set(objective.id, objective);
    byCategory.get(objective.cat)?.push(objective);
  }

  return { ...catalog, byId, byCategory };
}

let cached: IndexedCatalog | undefined;

/** The indexed catalog, built once per process. */
export function getIndexedCatalog(): IndexedCatalog {
  cached ??= indexCatalog(getCatalog());
  return cached;
}
```

`lib/catalog.ts` imports `data/locations.json`, which does not exist until Task 2. Create a placeholder now so the module compiles: `echo "[]" > data/locations.json`. Task 2 overwrites it.

Also enable JSON imports in `tsconfig.json` if `create-next-app` did not: `"resolveJsonModule": true` under `compilerOptions`.

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS, 12 tests across both files.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(catalog): scaffold the Next.js app and port the catalog to TypeScript"
```

---

### Task 2: Import the upstream dataset

**Files:**
- Create: `tools/import-danharper.ts`
- Modify: `data/locations.json`
- Test: `tests/import.test.ts`

**Interfaces:**
- Consumes: `Objective` from `lib/types.ts`.
- Produces: `convertEntries(entries)` returning `{ locations: Objective[]; skipped: string[] }`, and a populated `data/locations.json` that every later task reads.

- [ ] **Step 1: Write the failing test**

Create `tests/import.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { convertEntries, type UpstreamEntry } from '@/tools/import-danharper';

const upstream: UpstreamEntry[] = [
  { id: 1, type: 'Spaceship Part', title: 'Spaceship Part #1 - Mount Chiliad', lat: 83.1, lng: -120.5, notes: 'By the barns' },
  { id: 2, type: 'Spaceship Part', title: 'Spaceship Part #2', lat: 80, lng: -119 },
  { id: 3, type: 'Money', title: 'Briefcase', lat: 70, lng: -110 },
  { id: 4, type: 'Letter Scrap', title: 'Letter Scrap #1', lat: 75, lng: -115, notes: '' },
];

describe('convertEntries', () => {
  test('maps upstream types onto our categories', () => {
    const { locations } = convertEntries(upstream);
    expect(locations).toHaveLength(3);
    expect(locations.map((l) => l.cat)).toEqual(['spaceship', 'spaceship', 'letter']);
  });

  test('numbers ids per category, zero-padded', () => {
    const { locations } = convertEntries(upstream);
    expect(locations.map((l) => l.id)).toEqual(['spaceship-01', 'spaceship-02', 'letter-01']);
  });

  test('keeps the upstream title, coordinates and notes', () => {
    const [first] = convertEntries(upstream).locations;
    expect(first.name).toBe('Spaceship Part #1 - Mount Chiliad');
    expect(first.lat).toBe(83.1);
    expect(first.lng).toBe(-120.5);
    expect(first.notes).toBe('By the barns');
  });

  test('defaults missing notes to an empty string', () => {
    expect(convertEntries(upstream).locations[1].notes).toBe('');
  });

  test('links each objective to 100% and to its achievement', () => {
    expect(convertEntries(upstream).locations[0].counts_for)
      .toEqual(['100%', 'ach:from-beyond-the-stars']);
  });

  test('omits the achievement link for a category that has none', () => {
    const knife: UpstreamEntry[] = [{ id: 9, type: 'Knife Flight', title: 'Knife Flight #1', lat: 70, lng: -120 }];
    expect(convertEntries(knife).locations[0].counts_for).toEqual(['100%']);
  });

  test('reports the upstream types it skipped', () => {
    expect(convertEntries(upstream).skipped).toEqual(['Money']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/import.test.ts`
Expected: FAIL — cannot resolve `@/tools/import-danharper`.

- [ ] **Step 3: Write the importer**

Create `tools/import-danharper.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import type { Objective } from '@/lib/types';

export type UpstreamEntry = {
  id: number;
  type: string;
  title: string;
  lat: number;
  lng: number;
  notes?: string;
};

/** Upstream type to our category, plus the achievement that category feeds. */
const TYPE_MAP: Record<string, { cat: string; achievement: string | null }> = {
  'Spaceship Part': { cat: 'spaceship', achievement: 'from-beyond-the-stars' },
  'Letter Scrap': { cat: 'letter', achievement: 'a-mystery-solved' },
  'Nuclear Waste': { cat: 'waste', achievement: 'waste-management' },
  'Stunt Jump': { cat: 'stunt', achievement: 'show-off' },
  'Knife Flight': { cat: 'knife', achievement: null },
};

export function convertEntries(entries: UpstreamEntry[]): { locations: Objective[]; skipped: string[] } {
  const locations: Objective[] = [];
  const counters = new Map<string, number>();
  const skipped: string[] = [];

  for (const entry of entries) {
    const mapping = TYPE_MAP[entry.type];
    if (!mapping) {
      if (!skipped.includes(entry.type)) skipped.push(entry.type);
      continue;
    }

    const next = (counters.get(mapping.cat) ?? 0) + 1;
    counters.set(mapping.cat, next);

    const counts_for = ['100%'];
    if (mapping.achievement) counts_for.push(`ach:${mapping.achievement}`);

    locations.push({
      id: `${mapping.cat}-${String(next).padStart(2, '0')}`,
      cat: mapping.cat,
      name: entry.title,
      lat: entry.lat,
      lng: entry.lng,
      notes: entry.notes ?? '',
      counts_for,
    });
  }

  return { locations, skipped };
}

async function main(source: string): Promise<void> {
  const entries: UpstreamEntry[] = JSON.parse(await readFile(source, 'utf8'));
  const { locations, skipped } = convertEntries(entries);
  await writeFile(
    new URL('../data/locations.json', import.meta.url),
    `${JSON.stringify(locations, null, 2)}\n`,
    'utf8',
  );
  console.log(`Wrote ${locations.length} objectives.`);
  if (skipped.length > 0) console.log(`Skipped upstream types: ${skipped.join(', ')}`);
}

if (process.argv[2]) {
  await main(process.argv[2]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/import.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the real import**

```bash
curl -L -o upstream-locations.json https://raw.githubusercontent.com/danharper/GTAV/master/locations.json
npx tsx tools/import-danharper.ts upstream-locations.json
rm upstream-locations.json
```

- [ ] **Step 6: Validate the imported data**

Run: `npx tsx tools/validate.ts`
Expected: `Data is valid: ... objectives across 5 categories.`

If a category count comes up short, do not edit the expected total to match — the totals
are the game's, and a mismatch means the upstream file is incomplete. Set that category's
`expected` to `null`, note the real total in the spec under "Data sourcing", and continue.
Missing pins are filled in with the phase 4 editor.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(catalog): import collectible locations from the upstream dataset"
```

---

### Task 3: Database schema and Supabase clients

**Files:**
- Create: `supabase/migrations/0001_progress.sql`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/env.ts`, `middleware.ts`

**Interfaces:**
- Consumes: `.env.local`, already present.
- Produces: `createServerSupabase()` returning a Promise of a request-scoped Supabase client; `createBrowserSupabase()` returning a browser client; `SUPABASE_URL` and `SUPABASE_KEY` from `lib/env.ts`.

- [ ] **Step 1: Install the Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0001_progress.sql`:

```sql
-- One row per completed objective. Absence of a row means not done.
create table if not exists public.progress (
  user_id      uuid not null references auth.users on delete cascade,
  objective_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, objective_id)
);

alter table public.progress enable row level security;

-- The only rule the database needs: a user reaches their own rows and no others.
create policy "own rows" on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 3: Apply the migration**

Open the Supabase dashboard for the project, go to the SQL editor, paste the file and run
it. Then confirm in Table editor that `progress` exists and shows "RLS enabled".

There is no CLI step here on purpose: linking the CLI needs the database password, and the
project deliberately never stores it.

- [ ] **Step 4: Write the environment accessor**

Create `lib/env.ts`:

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_KEY = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
```

Failing at startup with the variable's name beats failing later with an opaque auth error.

- [ ] **Step 5: Write the Supabase clients**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

/** A Supabase client bound to the current request's cookies, acting as the signed-in user. */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}
```

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

/** Browser client. Used for authentication only — application data goes through /api. */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
```

- [ ] **Step 6: Write the middleware**

Create `middleware.ts` at the repository root:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes an expiring session and writes the new cookie onto the response.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/sign-in') || path.startsWith('/auth');
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|tiles|favicon.ico).*)'],
};
```

The matcher excludes tiles so map images never pay for an auth round trip.

- [ ] **Step 7: Verify the app still builds**

Run: `npm run build`
Expected: a successful build. A failure here is almost always a missing environment
variable or a `@/*` alias that `create-next-app` wrote differently — fix the cause, do not
loosen the check in `lib/env.ts`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): add the progress schema and Supabase clients"
```

---

### Task 4: Sign in, sign up, sign out

**Files:**
- Create: `app/sign-in/page.tsx`, `app/sign-in/sign-in-form.tsx`, `app/auth/sign-out/route.ts`, `app/globals.css`
- Modify: `app/page.tsx`, `app/layout.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabase` and `createServerSupabase` from Task 3.
- Produces: a working session. `app/page.tsx` renders only for a signed-in user and shows their email.

- [ ] **Step 1: Write the design tokens**

Replace `app/globals.css` with:

```css
:root {
  --sand: #EDE6D6;
  --asphalt: #1E2422;
  --teal: #35B0A7;
  --olive: #B9CE8E;
  --freeway: #E9D48A;
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
  background: var(--sand);
  color: var(--asphalt);
  font-family: system-ui, sans-serif;
}

a { color: inherit; }

:focus-visible { outline: 2px solid var(--asphalt); outline-offset: 2px; }
```

Typography arrives in phase 2 with the map screen; phase 1 only needs the tokens to exist.

- [ ] **Step 2: Write the sign-in form**

Create `app/sign-in/sign-in-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up';

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === 'sign-up') {
      setMessage('Account created. Check your email if confirmation is required, then sign in.');
      setMode('sign-in');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth">
      <h1>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>

      <label>
        Email
        <input type="email" value={email} required autoComplete="email"
          onChange={(event) => setEmail(event.target.value)} />
      </label>

      <label>
        Password
        <input type="password" value={password} required minLength={8}
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          onChange={(event) => setPassword(event.target.value)} />
      </label>

      <button type="submit" disabled={busy}>
        {mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>

      {message && <p role="status">{message}</p>}

      <button type="button" className="link" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
        {mode === 'sign-in' ? 'Create an account instead' : 'Sign in instead'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write the sign-in page and the sign-out route**

Create `app/sign-in/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/');

  return <main className="auth-screen"><SignInForm /></main>;
}
```

Create `app/auth/sign-out/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 });
}
```

`POST` rather than `GET`: signing out changes state, and a link prefetch must not do it.

- [ ] **Step 4: Make the home page prove the session**

Replace `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <main className="home">
      <p>Signed in as {user.email}</p>
      <form action="/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

The map replaces this page in phase 2.

- [ ] **Step 5: Verify by hand**

Run `npm run dev` and open `http://localhost:3000`.

1. You are redirected to `/sign-in`.
2. Create an account. If the Supabase project requires email confirmation, confirm it, or
   turn confirmation off in Authentication → Providers → Email while developing.
3. Sign in. You land on `/` and see your email.
4. Reload. You stay signed in — this is what proves the middleware refresh works.
5. Sign out. You return to `/sign-in`, and visiting `/` sends you back there.
6. In the Supabase dashboard, Authentication → Users shows the account.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): add sign-in, sign-up and sign-out"
```

---

### Task 5: The catalog API

**Files:**
- Create: `app/api/catalog/route.ts`
- Test: `tests/api-catalog.test.ts`

**Interfaces:**
- Consumes: `getCatalog` from Task 1.
- Produces: `GET /api/catalog` answering `200` with `{ categories, locations, achievements }`.

- [ ] **Step 1: Write the failing test**

Create `tests/api-catalog.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { GET } from '@/app/api/catalog/route';

describe('GET /api/catalog', () => {
  test('answers with the catalog', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.locations)).toBe(true);
    expect(Array.isArray(body.achievements)).toBe(true);
    expect(body.categories.some((c: { id: string }) => c.id === 'spaceship')).toBe(true);
  });

  test('is cacheable, because the catalog does not vary by user', async () => {
    const response = await GET();
    expect(response.headers.get('cache-control')).toMatch(/max-age/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api-catalog.test.ts`
Expected: FAIL — cannot resolve `@/app/api/catalog/route`.

- [ ] **Step 3: Write the route**

Create `app/api/catalog/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog';

/** The catalog is identical for every user and changes only on deploy. */
export async function GET() {
  return NextResponse.json(getCatalog(), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api-catalog.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): serve the objective catalog"
```

---

### Task 6: The progress API

**Files:**
- Create: `app/api/progress/route.ts`, `app/api/progress/[id]/route.ts`, `tests/helpers/supabase.ts`
- Test: `tests/api-progress.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase` from Task 3, `getIndexedCatalog` from Task 1.
- Produces: `GET /api/progress` → `{ done: ProgressMap }`; `PUT /api/progress/<id>` with body `{ done: boolean }`; `DELETE /api/progress` with body `{ ids: string[] }`. All answer `401` without a session.

- [ ] **Step 1: Write the fake Supabase client**

Create `tests/helpers/supabase.ts`:

```ts
export type Row = { objective_id: string; completed_at: string };

export type Recorded = {
  upserts: Record<string, unknown>[];
  deletedEq: string[];
  deletedIn: string[][];
};

/**
 * A stand-in for the Supabase client covering exactly the calls the progress routes make.
 * Row-level security is the database's job, so the fake does not model it.
 */
export function fakeSupabase({ user, rows = [] }: { user: { id: string } | null; rows?: Row[] }) {
  const recorded: Recorded = { upserts: [], deletedEq: [], deletedIn: [] };

  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: () => ({
      select: async () => ({ data: rows, error: null }),
      upsert: async (values: Record<string, unknown>) => {
        recorded.upserts.push(values);
        return { error: null };
      },
      delete: () => ({
        eq: (_column: string, value: string) => {
          recorded.deletedEq.push(value);
          return Promise.resolve({ error: null });
        },
        in: (_column: string, values: string[]) => {
          recorded.deletedIn.push(values);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };

  return { client, recorded };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/api-progress.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeSupabase, type Recorded } from './helpers/supabase';

const holder: { current: unknown } = { current: null };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => holder.current,
}));

const { GET, DELETE } = await import('@/app/api/progress/route');
const { PUT } = await import('@/app/api/progress/[id]/route');

const asUser = (rows: { objective_id: string; completed_at: string }[] = []): Recorded => {
  const { client, recorded } = fakeSupabase({ user: { id: 'user-1' }, rows });
  holder.current = client;
  return recorded;
};

const asAnonymous = () => {
  holder.current = fakeSupabase({ user: null }).client;
};

const put = (id: string, done: boolean) =>
  PUT(new Request('http://test/api/progress/x', {
    method: 'PUT',
    body: JSON.stringify({ done }),
  }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  holder.current = null;
});

describe('GET /api/progress', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    expect((await GET()).status).toBe(401);
  });

  test('returns completion timestamps keyed by objective id', async () => {
    asUser([{ objective_id: 'spaceship-01', completed_at: '2026-08-20T10:00:00.000Z' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      done: { 'spaceship-01': '2026-08-20T10:00:00.000Z' },
    });
  });
});

describe('PUT /api/progress/[id]', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    expect((await put('spaceship-01', true)).status).toBe(401);
  });

  test('answers 404 for an objective that is not in the catalog', async () => {
    asUser();
    expect((await put('does-not-exist', true)).status).toBe(404);
  });

  test('writes a row when marking an objective done', async () => {
    const recorded = asUser();
    const response = await put('spaceship-01', true);
    expect(response.status).toBe(200);
    expect(recorded.upserts).toHaveLength(1);
    expect(recorded.upserts[0]).toMatchObject({ user_id: 'user-1', objective_id: 'spaceship-01' });
  });

  test('removes the row when marking an objective not done', async () => {
    const recorded = asUser();
    const response = await put('spaceship-01', false);
    expect(response.status).toBe(200);
    expect(recorded.deletedEq).toEqual(['spaceship-01']);
    expect(recorded.upserts).toHaveLength(0);
  });

  test('answers 400 when the body has no boolean done', async () => {
    asUser();
    const response = await PUT(
      new Request('http://test/api/progress/x', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ id: 'spaceship-01' }) },
    );
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/progress', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    const request = new Request('http://test/api/progress', {
      method: 'DELETE', body: JSON.stringify({ ids: ['spaceship-01'] }),
    });
    expect((await DELETE(request)).status).toBe(401);
  });

  test('deletes the ids it is given', async () => {
    const recorded = asUser();
    const request = new Request('http://test/api/progress', {
      method: 'DELETE', body: JSON.stringify({ ids: ['spaceship-01', 'spaceship-02'] }),
    });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(recorded.deletedIn).toEqual([['spaceship-01', 'spaceship-02']]);
  });

  test('answers 400 when ids is not an array of strings', async () => {
    asUser();
    const request = new Request('http://test/api/progress', {
      method: 'DELETE', body: JSON.stringify({ ids: 'spaceship-01' }),
    });
    expect((await DELETE(request)).status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/api-progress.test.ts`
Expected: FAIL — cannot resolve `@/app/api/progress/route`.

- [ ] **Step 4: Write the collection route**

Create `app/api/progress/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ProgressMap } from '@/lib/types';

const unauthorized = () => NextResponse.json({ error: 'Sign in required' }, { status: 401 });

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data, error } = await supabase.from('progress').select('objective_id, completed_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const done: ProgressMap = {};
  for (const row of data ?? []) done[row.objective_id] = row.completed_at;

  return NextResponse.json({ done });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  let ids: unknown;
  try {
    ({ ids } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids must be an array of strings' }, { status: 400 });
  }

  const { error } = await supabase.from('progress').delete().in('objective_id', ids as string[]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write the item route**

Create `app/api/progress/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getIndexedCatalog } from '@/lib/catalog';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await params;
  if (!getIndexedCatalog().byId.has(id)) {
    return NextResponse.json({ error: `Unknown objective: ${id}` }, { status: 404 });
  }

  let done: unknown;
  try {
    ({ done } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (typeof done !== 'boolean') {
    return NextResponse.json({ error: 'done must be a boolean' }, { status: 400 });
  }

  const table = supabase.from('progress');
  const { error } = done
    ? await table.upsert({ user_id: user.id, objective_id: id })
    : await table.delete().eq('objective_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id, done });
}
```

The delete filters on `objective_id` alone because the policy already restricts the rows
to this user; adding `user_id` would be belt and braces over a constraint the database
enforces.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/api-progress.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Verify against the real database**

With `npm run dev` running and a signed-in browser session, in the browser console:

```js
await fetch('/api/progress/spaceship-01', {
  method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ done: true }),
}).then((r) => r.json());

await fetch('/api/progress').then((r) => r.json());
```

Expected: the first call answers `{ id: 'spaceship-01', done: true }`, the second includes
`spaceship-01` with a timestamp, and the Supabase table editor shows exactly one row whose
`user_id` is your account. Then set `done: false` and confirm the row disappears.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): read and write per-user objective progress"
```

---

### Task 7: Docker packaging

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: the whole application.
- Produces: `docker compose up` serving the app on port 3000 with tiles mounted from `./tiles`.

- [ ] **Step 1: Enable the standalone build**

In `next.config.ts`, set `output`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Write the .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
tiles
public/tiles
docs
.env*.local
```

- [ ] **Step 3: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The publishable key is inlined into the client bundle at build time, so it is needed here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

- [ ] **Step 4: Write the compose file**

Create `docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
    ports:
      - "3000:3000"
    volumes:
      # Rockstar artwork: mounted at runtime, never baked into the image.
      - ./tiles:/app/public/tiles:ro
    restart: unless-stopped
```

There is no database service: Postgres is Supabase Cloud.

- [ ] **Step 5: Fetch the tiles**

```bash
git clone --depth 1 https://github.com/meesvrh/GTAV-Map-Tiles /tmp/gtav-tiles
cp -r /tmp/gtav-tiles/tiles/atlas tiles
rm -rf /tmp/gtav-tiles
```

The result must be `tiles/0/0/0.jpg` through `tiles/5/...`. Only the `atlas` style is
copied; `satellite` is not used.

- [ ] **Step 6: Verify the container**

```bash
docker compose --env-file .env.local up --build -d
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/catalog
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tiles/3/3/3.jpg
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/progress
```

Expected: `200` for the catalog, `200` for the tile, `401` for progress without a session.
Then open `http://localhost:3000` in a browser and sign in, to confirm auth works in the
container. Finish with `docker compose down`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(deploy): package the app with Docker and compose"
```

---

### Task 8: Documentation and phase close

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: setup instructions covering tiles, environment, migration, and the test commands.

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, all tests across every test file.

- [ ] **Step 2: Validate the data**

Run: `npx tsx tools/validate.ts`
Expected: `Data is valid: ...`

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: a successful production build.

- [ ] **Step 4: Write the README**

Create `README.md`:

```markdown
# GTA V Completion Tracker

Tracks GTA V 100% completion and achievements against a signed-in account.

## Requirements

- Node 22 and npm, or Docker
- A Supabase Cloud project

## Setup

1. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key
   from Supabase → Project settings → API.
2. Apply `supabase/migrations/0001_progress.sql` in the Supabase SQL editor.
3. Fetch the map tiles, which are not committed:

       git clone --depth 1 https://github.com/meesvrh/GTAV-Map-Tiles /tmp/gtav-tiles
       cp -r /tmp/gtav-tiles/tiles/atlas tiles

## Run

Development:

    npm install
    npm run dev

With Docker:

    docker compose --env-file .env.local up --build

The app listens on port 3000.

## Develop

    npx vitest run          # unit tests
    npx tsx tools/validate.ts   # catalog integrity

## How data is split

The catalog — categories, objectives, achievements — is static JSON in `data/`, versioned
in git. Per-user progress lives in Supabase Postgres, one row per completed objective,
protected by row-level security. The browser reaches progress only through this app's
`/api` routes.

## Credits

Coordinates adapted from [danharper/GTAV](https://github.com/danharper/GTAV) (WTFPL).
Map tiles from [meesvrh/GTAV-Map-Tiles](https://github.com/meesvrh/GTAV-Map-Tiles); the
artwork is Rockstar's.
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: document setup, deployment and the data split"
```

---

## Phase 1 acceptance

Complete when each of these has been run and seen to pass:

- `npx vitest run` passes.
- `npx tsx tools/validate.ts` reports valid data.
- `npm run build` succeeds.
- Signing up, signing in, reloading and signing out all behave, and the account appears in
  the Supabase dashboard.
- `GET /api/progress` answers `401` without a session and a `done` map with one.
- `PUT /api/progress/spaceship-01` with `{ done: true }` creates exactly one row for the
  signed-in user in the Supabase table editor, and `{ done: false }` removes it.
- `PUT /api/progress/does-not-exist` answers `404`.
- `docker compose --env-file .env.local up --build` serves the app and a tile.

## Not in this phase

The map, markers, sidebar, tally strips, checklist objectives, achievement rules,
per-category reset, and the pin editor. Each has its own phase and its own plan.
