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

/**
 * The upstream project drew its markers on Google Maps with its own tile set, which placed
 * the GTA V map in a different part of the world square than the Leaflet tiles this app
 * uses. Both render the same picture, so the two spaces differ by a uniform scale and a
 * translation, applied here in normalized world coordinates.
 *
 * The numbers come from `tools/fit-alignment.mjs`, which anchors the scale on the landmass
 * bounding box and then refines it against a land mask built from the tiles, scoring only
 * letter scraps and stunt jumps because those are the categories that are certainly ashore.
 * `tools/preview-alignment.mjs` renders the result for inspection.
 */
const ALIGNMENT = {
  scale: 2.7516893378545864,
  tx: 0.03849575330589484,
  ty: 0.012465769837507985,
};

/** Web Mercator, forward and back, in the unit square Leaflet's default CRS uses. */
function toNormalized(lat: number, lng: number): [number, number] {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

function fromNormalized(x: number, y: number): [number, number] {
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lat, lng];
}

/** Moves one upstream coordinate onto our tiles. */
export function align(lat: number, lng: number): [number, number] {
  const [x, y] = toNormalized(lat, lng);
  return fromNormalized(x * ALIGNMENT.scale + ALIGNMENT.tx, y * ALIGNMENT.scale + ALIGNMENT.ty);
}

/** Upstream type to our category, plus the achievement that category feeds. */
const TYPE_MAP: Record<string, { cat: string; achievement: string | null }> = {
  'Spaceship Part': { cat: 'spaceship', achievement: 'from-beyond-the-stars' },
  'Letter Scrap': { cat: 'letter', achievement: 'a-mystery-solved' },
  'Nuclear Waste': { cat: 'waste', achievement: 'waste-management' },
  'Stunt Jump': { cat: 'stunt', achievement: 'show-off' },
  'Knife Flight': { cat: 'knife', achievement: null },
  'Under the Bridge': { cat: 'bridge', achievement: null },
  'Epsilon Tract': { cat: 'epsilon', achievement: null },
};

export function convertEntries(entries: UpstreamEntry[]): {
  locations: Objective[];
  skipped: string[];
} {
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

    const [lat, lng] = align(entry.lat, entry.lng);

    locations.push({
      id: `${mapping.cat}-${String(next).padStart(2, '0')}`,
      cat: mapping.cat,
      name: entry.title,
      lat,
      lng,
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

// Guarded on the entry point, not merely on an argument: this module is imported by
// tools/build-catalog.ts, which is itself run with arguments.
if (process.argv[1]?.endsWith('import-danharper.ts') && process.argv[2]) {
  main(process.argv[2]).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
