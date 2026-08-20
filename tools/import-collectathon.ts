import type { Objective } from '@/lib/types';

/**
 * Converts collectibles published in GTA V game world coordinates.
 *
 * Game coordinates are the canonical space: mods and FiveM resources use them. The mapping
 * onto the map is not fitted here, it is the published one. gta-v-map-leaflet defines the
 * GTA V CRS for exactly these tiles, atlas style at zoom 0 to 5, as
 * `L.Transformation(0.02072, 117.3, -0.0205, 172.8)` over game x and y. Leaflet applies a
 * transformation as `(a * value + b) * 2^zoom` in pixels, so at zoom 0 the whole map
 * occupies one 256 pixel tile, and dividing by 256 gives the position in the unit square
 * our tiles use.
 *
 * An earlier version fitted this mapping against our own data instead. That data had itself
 * been fitted, so the fit inherited its error and placed every pin about nine percent short
 * and shifted north west. A published constant beats a good fit.
 *
 * Sources: https://github.com/Mobius1/collectathon (GPL-3.0) for the coordinates,
 * https://github.com/RiceaRaul/gta-v-map-leaflet for the CRS.
 */
const TILE_PIXELS = 256;
const CRS = { scaleX: 0.02072, centerX: 117.3, scaleY: 0.0205, centerY: 172.8 };

export type GameSets = Record<string, [number, number][]>;

type SetMapping = { cat: string; achievement: string | null; label: string };

/** Source set name to our category, the achievement it feeds, and the objective label. */
const SET_MAP: Record<string, SetMapping> = {
  LetterScraps: { cat: 'letter', achievement: 'a-mystery-solved', label: 'Letter Scrap' },
  SpaceshipParts: {
    cat: 'spaceship',
    achievement: 'from-beyond-the-stars',
    label: 'Spaceship Part',
  },
  NuclearWaste: { cat: 'waste', achievement: 'waste-management', label: 'Nuclear Waste' },
  EpsilonTracts: { cat: 'epsilon', achievement: null, label: 'Epsilon Tract' },
  SubParts: { cat: 'submarine', achievement: null, label: 'Submarine Part' },
  HiddenPackages: { cat: 'package', achievement: null, label: 'Hidden Package' },
};

/** Game coordinates to latitude and longitude in the map's default CRS. */
export function fromGame(gx: number, gy: number): [number, number] {
  const x = (gx * CRS.scaleX + CRS.centerX) / TILE_PIXELS;
  const y = (CRS.centerY - gy * CRS.scaleY) / TILE_PIXELS;
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lat, lng];
}

/** Parses the coordinate tables out of the source's Lua config. */
export function parseLuaConfig(lua: string): GameSets {
  const sets: GameSets = {};

  for (const match of lua.matchAll(/(\w+)\s*=\s*\{\s*\n\s*enabled/g)) {
    const setName = match[1];
    const start = lua.indexOf(`${setName} = {`);
    const itemsAt = lua.indexOf('items = {', start);
    if (itemsAt < 0) continue;

    const end = lua.indexOf('\n        }', itemsAt);
    const chunk = lua.slice(itemsAt, end < 0 ? lua.length : end);

    const coords = [
      ...chunk.matchAll(/vector3\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g),
    ].map((coord): [number, number] => [Number(coord[1]), Number(coord[2])]);

    if (coords.length > 0) sets[setName] = coords;
  }

  return sets;
}

export function convertSets(sets: GameSets): { locations: Objective[]; skipped: string[] } {
  const locations: Objective[] = [];
  const skipped: string[] = [];

  for (const [setName, coords] of Object.entries(sets)) {
    const mapping = SET_MAP[setName];
    if (!mapping) {
      skipped.push(setName);
      continue;
    }

    coords.forEach((coord, index) => {
      const [lat, lng] = fromGame(coord[0], coord[1]);
      const counts_for = ['100%'];
      if (mapping.achievement) counts_for.push(`ach:${mapping.achievement}`);

      locations.push({
        id: `${mapping.cat}-${String(index + 1).padStart(2, '0')}`,
        cat: mapping.cat,
        name: `${mapping.label} #${index + 1}`,
        lat,
        lng,
        notes: '',
        counts_for,
      });
    });
  }

  return { locations, skipped };
}
