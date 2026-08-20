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
  main(process.argv[2]).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
