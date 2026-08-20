/**
 * Checks the placement of the catalog against the tiles, and reports the offset that fits
 * best if there is one.
 *
 * The scale comes from the published GTA V CRS and is not touched. Only the two offsets are
 * free, and they are scored on a constraint that cannot be satisfied by cheating: letter
 * scraps and stunt jumps must be on land, while nuclear waste and submarine parts must be in
 * water. Shrinking or sliding to satisfy one side breaks the other.
 *
 * If the best offset is near zero, the placement is already right and any remaining visual
 * difference is somewhere else. That answer is as useful as a correction.
 *
 * Run: node tools/refine-offset.mjs
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import jpeg from 'jpeg-js';

const ZOOM = 4;
const TILE = 256;
const GRID = 1 << ZOOM;
const SIZE = GRID * TILE;

/** One normalized unit spans the world square. */
const UNITS_TO_METRES = TILE / 0.02072;

const ON_LAND = new Set(['letter', 'stunt']);
const IN_WATER = new Set(['waste', 'submarine']);

const toNormalized = (lat, lng) => {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  return [x, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
};

/** Water in these tiles is a saturated cyan. Shallow water near a shore is paler, so a
 *  point just off the coast can read as land; the water side of the score is the lenient
 *  one for that reason, and the land side carries the weight. */
const isWater = (r, g, b) => b > 150 && b - r > 55 && g > r;

async function landMask() {
  const mask = new Uint8Array(SIZE * SIZE);

  for (let tx = 0; tx < GRID; tx += 1) {
    for (let ty = 0; ty < GRID; ty += 1) {
      const path = `public/tiles/${ZOOM}/${tx}/${ty}.jpg`;
      if (!existsSync(path)) continue;
      const { data, width, height } = jpeg.decode(await readFile(path), { useTArray: true });
      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          const i = (py * width + px) * 4;
          if (isWater(data[i], data[i + 1], data[i + 2])) continue;
          mask[(ty * TILE + py) * SIZE + (tx * TILE + px)] = 1;
        }
      }
    }
  }

  return mask;
}

async function main() {
  const locations = JSON.parse(await readFile('data/locations.json', 'utf8'));
  const land = [];
  const water = [];

  for (const item of locations) {
    if (typeof item.lat !== 'number') continue;
    const point = toNormalized(item.lat, item.lng);
    if (ON_LAND.has(item.cat)) land.push(point);
    else if (IN_WATER.has(item.cat)) water.push(point);
  }

  const mask = await landMask();
  const onLand = ([x, y], dx, dy) => {
    const px = Math.round((x + dx) * SIZE);
    const py = Math.round((y + dy) * SIZE);
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return 0;
    return mask[py * SIZE + px];
  };

  const score = (dx, dy) => {
    let hits = 0;
    for (const point of land) hits += onLand(point, dx, dy);
    for (const point of water) hits += 1 - onLand(point, dx, dy);
    return hits;
  };

  const total = land.length + water.length;
  console.log(`${land.length} objectives that must be ashore, ${water.length} that must be at sea.`);
  console.log(`no offset: ${score(0, 0)}/${total} correct\n`);

  let best = { dx: 0, dy: 0, hits: score(0, 0) };
  const step = 1 / SIZE; // one pixel at the zoom the mask was built from

  for (let i = -60; i <= 60; i += 1) {
    for (let j = -60; j <= 60; j += 1) {
      const dx = i * step;
      const dy = j * step;
      const hits = score(dx, dy);
      if (hits > best.hits) best = { dx, dy, hits };
    }
  }

  const metres = (value) => (value * UNITS_TO_METRES).toFixed(0);
  console.log(`best offset: dx ${best.dx.toFixed(6)} dy ${best.dy.toFixed(6)} -> ${best.hits}/${total}`);
  console.log(`that is ${metres(best.dx)} m east and ${metres(best.dy)} m south, ${(Math.hypot(best.dx, best.dy) * SIZE).toFixed(1)} pixels at zoom ${ZOOM}`);

  if (best.hits - score(0, 0) < 3) {
    console.log('\nThe gain is within noise. The placement is already right; look elsewhere.');
  }
}

await main();
