import { describe, expect, test } from 'vitest';
import { convertSets, fromGame, parseLuaConfig } from '@/tools/import-collectathon';

const lua = `
Config.Collectables = {
    LetterScraps = {
        enabled = true,
        title = "Letter Scraps",
        items = {
            { id=1, coords = vector3(1469.5,6552,15) },
            { id=2, coords = vector3(-1048.5,-2734.5,14) },
        }
    },
    SubParts = {
        enabled = true,
        title = "Submarine Parts",
        items = {
            { id=1, coords = vector3(3423.5,5171,-20) },
        }
    },
    Cowboys = {
        enabled = true,
        title = "Not one of ours",
        items = {
            { id=1, coords = vector3(0,0,0) },
        }
    },
}
`;

describe('parseLuaConfig', () => {
  test('reads each set with its coordinates', () => {
    const sets = parseLuaConfig(lua);
    expect(Object.keys(sets).sort()).toEqual(['Cowboys', 'LetterScraps', 'SubParts']);
    expect(sets.LetterScraps).toHaveLength(2);
  });

  test('keeps x and y and drops the height', () => {
    const sets = parseLuaConfig(lua);
    expect(sets.LetterScraps[0]).toEqual([1469.5, 6552]);
    expect(sets.LetterScraps[1]).toEqual([-1048.5, -2734.5]);
  });
});

describe('fromGame', () => {
  // Golden values from the published GTA V CRS, not from a fit. A change to the mapping
  // should be a deliberate edit here, never a silent shift of every pin on the map.
  test('maps game coordinates onto the map', () => {
    const [lat, lng] = fromGame(0, 0);
    expect(lng).toBeCloseTo(-15.046875, 4);
    expect(lat).toBeCloseTo(-53.162582, 4);
  });

  test('game north is up, so a larger y gives a larger latitude', () => {
    const [northLat] = fromGame(0, 6000);
    const [southLat] = fromGame(0, -3000);
    expect(northLat).toBeGreaterThan(southLat);
  });

  test('game east is right, so a larger x gives a larger longitude', () => {
    const [, eastLng] = fromGame(3000, 0);
    const [, westLng] = fromGame(-3000, 0);
    expect(eastLng).toBeGreaterThan(westLng);
  });
});

describe('convertSets', () => {
  test('maps known sets onto our categories and reports the rest', () => {
    const { locations, skipped } = convertSets(parseLuaConfig(lua));
    expect(locations.map((l) => l.cat).sort()).toEqual(['letter', 'letter', 'submarine']);
    expect(skipped).toEqual(['Cowboys']);
  });

  test('numbers ids per category and names them in sequence', () => {
    const { locations } = convertSets(parseLuaConfig(lua));
    const letters = locations.filter((l) => l.cat === 'letter');
    expect(letters.map((l) => l.id)).toEqual(['letter-01', 'letter-02']);
    expect(letters[0].name).toBe('Letter Scrap #1');
  });

  test('links a category to its achievement, and omits the link where there is none', () => {
    const { locations } = convertSets(parseLuaConfig(lua));
    expect(locations.find((l) => l.cat === 'letter')?.counts_for).toEqual([
      '100%',
      'ach:a-mystery-solved',
    ]);
    expect(locations.find((l) => l.cat === 'submarine')?.counts_for).toEqual(['100%']);
  });

  test('produces coordinates inside the map, not raw game numbers', () => {
    const { locations } = convertSets(parseLuaConfig(lua));
    for (const item of locations) {
      expect(Math.abs(item.lat!)).toBeLessThan(85.06);
      expect(Math.abs(item.lng!)).toBeLessThan(180);
    }
  });
});
