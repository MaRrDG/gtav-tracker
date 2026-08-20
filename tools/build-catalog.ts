import { readFile, writeFile } from 'node:fs/promises';
import type { Objective } from '@/lib/types';
import { convertEntries, type UpstreamEntry } from '@/tools/import-danharper';
import { convertSets, parseLuaConfig } from '@/tools/import-collectathon';

/**
 * Builds data/locations.json from both upstream sources.
 *
 * The two are not interchangeable. Collectathon publishes game world coordinates, which are
 * authoritative and calibrated to within about 12 metres, so it owns every category it
 * covers. The older marker set was placed by hand on a different map and reaches ours
 * through a fitted transform, so it is used only for the categories nothing else supplies.
 *
 * Usage: npx tsx tools/build-catalog.ts <collectathon config.lua> <danharper locations.json>
 */

/** Categories the hand-placed set still supplies, because game coordinates are not published. */
const FROM_MARKERS = new Set(['stunt', 'knife', 'bridge']);

async function main(luaPath: string, markersPath: string): Promise<void> {
  const sets = parseLuaConfig(await readFile(luaPath, 'utf8'));
  const fromGame = convertSets(sets);

  const entries: UpstreamEntry[] = JSON.parse(await readFile(markersPath, 'utf8'));
  const fromMarkers = convertEntries(entries);

  const locations: Objective[] = [
    ...fromGame.locations,
    ...fromMarkers.locations.filter((item) => FROM_MARKERS.has(item.cat)),
  ];

  locations.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(
    new URL('../data/locations.json', import.meta.url),
    `${JSON.stringify(locations, null, 2)}\n`,
    'utf8',
  );

  const counts = new Map<string, number>();
  for (const item of locations) counts.set(item.cat, (counts.get(item.cat) ?? 0) + 1);

  console.log(`Wrote ${locations.length} objectives.`);
  for (const [cat, count] of [...counts].sort()) {
    const source = FROM_MARKERS.has(cat) ? 'hand-placed markers' : 'game coordinates';
    console.log(`  ${cat.padEnd(10)} ${String(count).padStart(3)}  ${source}`);
  }
  if (fromGame.skipped.length > 0) console.log(`Skipped sets: ${fromGame.skipped.join(', ')}`);
}

const [lua, markers] = process.argv.slice(2);
if (!lua || !markers) {
  console.error('Usage: npx tsx tools/build-catalog.ts <config.lua> <locations.json>');
  process.exit(1);
}

main(lua, markers).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
