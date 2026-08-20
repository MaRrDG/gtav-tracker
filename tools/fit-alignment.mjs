/**
 * Finds the transform that moves the imported coordinates onto our tile set.
 *
 * The coordinates come from a Google Maps project whose tiles placed the GTA V map in a
 * different part of the world square than the Leaflet tiles this app uses. Both render the
 * same picture, so the mapping between the two normalized spaces is a uniform scale plus a
 * translation.
 *
 * Rather than searching for it, the transform is read off two bounding boxes: where the
 * objectives sit in the source space, and where the landmass sits in ours. Matching them is
 * only valid if both describe the same rectangle, so the script prints the two aspect
 * ratios. If they disagree, the assumption is wrong and the numbers must not be used.
 *
 * Run: node tools/fit-alignment.mjs
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import jpeg from 'jpeg-js';

const ZOOM = 4;
const TILE = 256;
const GRID = 1 << ZOOM;
const SIZE = GRID * TILE;

const toNormalized = (lat, lng) => {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
};

/** Water in these tiles is a saturated cyan; land never is. */
const isWater = (r, g, b) => b > 150 && b - r > 55 && g > r;

/** Rows and columns holding at least this many land pixels count as land. */
const LAND_LINE_THRESHOLD = 12;

let cachedMask = null;

async function landMask() {
  if (cachedMask) return cachedMask;
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

  cachedMask = mask;
  return mask;
}

async function landBox() {
  const rows = new Int32Array(SIZE);
  const cols = new Int32Array(SIZE);
  let decoded = 0;

  for (let tx = 0; tx < GRID; tx += 1) {
    for (let ty = 0; ty < GRID; ty += 1) {
      const path = `public/tiles/${ZOOM}/${tx}/${ty}.jpg`;
      if (!existsSync(path)) continue;

      const { data, width, height } = jpeg.decode(await readFile(path), { useTArray: true });
      decoded += 1;

      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          const i = (py * width + px) * 4;
          if (isWater(data[i], data[i + 1], data[i + 2])) continue;
          rows[ty * TILE + py] += 1;
          cols[tx * TILE + px] += 1;
        }
      }
    }
  }

  const span = (counts) => {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] < LAND_LINE_THRESHOLD) continue;
      if (lo < 0) lo = i;
      hi = i;
    }
    return [lo / SIZE, (hi + 1) / SIZE];
  };

  const [minX, maxX] = span(cols);
  const [minY, maxY] = span(rows);
  console.log(`Decoded ${decoded} tiles at zoom ${ZOOM}.`);
  return { minX, maxX, minY, maxY };
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

async function main() {
  const locations = JSON.parse(await readFile('data/locations.json', 'utf8'));

  // Every objective, used for the bounding box: only the full set reaches far enough in
  // each direction to describe the same rectangle as the landmass.
  const points = locations
    .filter((item) => typeof item.lat === 'number')
    .map((item) => toNormalized(item.lat, item.lng));

  // Scoring uses only categories that are unambiguously on dry land. Nuclear waste is
  // collected underwater by submarine and some spaceship parts sit offshore, so counting
  // those as misses would drag the fit inward.
  const ON_LAND = new Set(['letter', 'stunt']);
  const landPoints = locations
    .filter((item) => typeof item.lat === 'number' && ON_LAND.has(item.cat))
    .map((item) => toNormalized(item.lat, item.lng));

  // Kept aside as an independent check: if the transform is right, these land in water.
  const underwater = locations
    .filter((item) => item.cat === 'waste')
    .map((item) => toNormalized(item.lat, item.lng));

  // Percentiles rather than extremes: a handful of objectives sit offshore, and one of
  // them at the very edge would drag the box out and skew the whole fit.
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const data = {
    minX: quantile(xs, 0.01),
    maxX: quantile(xs, 0.99),
    minY: quantile(ys, 0.01),
    maxY: quantile(ys, 0.99),
  };

  const land = await landBox();

  const dataW = data.maxX - data.minX;
  const dataH = data.maxY - data.minY;
  const landW = land.maxX - land.minX;
  const landH = land.maxY - land.minY;

  console.log(`\nobjectives  x ${data.minX.toFixed(4)}..${data.maxX.toFixed(4)}  y ${data.minY.toFixed(4)}..${data.maxY.toFixed(4)}  aspect ${(dataW / dataH).toFixed(3)}`);
  console.log(`landmass    x ${land.minX.toFixed(4)}..${land.maxX.toFixed(4)}  y ${land.minY.toFixed(4)}..${land.maxY.toFixed(4)}  aspect ${(landW / landH).toFixed(3)}`);

  const scaleX = landW / dataW;
  const scaleY = landH / dataH;
  const disagreement = Math.abs(scaleX - scaleY) / ((scaleX + scaleY) / 2);
  console.log(`\nscale from width ${scaleX.toFixed(4)}, from height ${scaleY.toFixed(4)}, disagreement ${(disagreement * 100).toFixed(1)}%`);

  if (disagreement > 0.08) {
    console.log('\nThe two boxes are not the same rectangle. A uniform scale does not describe');
    console.log('this mapping, so these numbers are not a transform. Do not use them.');
    return;
  }

  const baseScale = (scaleX + scaleY) / 2;
  const base = {
    scale: baseScale,
    tx: land.minX - data.minX * baseScale,
    ty: land.minY - data.minY * baseScale,
  };

  // The boxes agree on the rectangle but not on its exact edges, because the objectives do
  // not reach the coastline everywhere. Refine against the mask, with the scale pinned near
  // the value the boxes established: that is what stops the search collapsing onto a tiny
  // scale where every point trivially lands on some patch of land.
  const mask = await landMask();
  const score = (scale, tx, ty) => {
    let hits = 0;
    for (const [nx, ny] of landPoints) {
      const px = Math.round((nx * scale + tx) * SIZE);
      const py = Math.round((ny * scale + ty) * SIZE);
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      hits += mask[py * SIZE + px];
    }
    return hits;
  };

  const best = { ...base, hits: score(base.scale, base.tx, base.ty) };
  console.log(`\nbox estimate puts ${best.hits}/${points.length} objectives on land`);

  let step = { scale: baseScale * 0.015, offset: 0.008 };
  for (let pass = 0; pass < 4; pass += 1) {
    const found = { ...best };
    for (let i = -8; i <= 8; i += 1) {
      for (let j = -8; j <= 8; j += 1) {
        for (let k = -8; k <= 8; k += 1) {
          const scale = best.scale + i * step.scale;
          const tx = best.tx + j * step.offset;
          const ty = best.ty + k * step.offset;
          const hits = score(scale, tx, ty);
          if (hits > found.hits) Object.assign(found, { scale, tx, ty, hits });
        }
      }
    }
    Object.assign(best, found);
    console.log(`pass ${pass + 1}: ${best.hits}/${landPoints.length} on land`);
    step = { scale: step.scale / 3, offset: step.offset / 3 };
  }

  const drift = ((best.scale - baseScale) / baseScale) * 100;
  console.log(`\nrefinement moved the scale ${drift.toFixed(1)}% from the box estimate`);

  // The check the fit never saw: nuclear waste is collected underwater, so a correct
  // transform drops it in the sea. If most of it lands ashore, the fit is wrong.
  let inWater = 0;
  for (const [nx, ny] of underwater) {
    const px = Math.round((nx * best.scale + best.tx) * SIZE);
    const py = Math.round((ny * best.scale + best.ty) * SIZE);
    const inside = px >= 0 && py >= 0 && px < SIZE && py < SIZE;
    if (!inside || mask[py * SIZE + px] === 0) inWater += 1;
  }
  console.log(`independent check: ${inWater}/${underwater.length} nuclear waste in water`);
  console.log('\nTransform on normalized world coordinates:');
  console.log(JSON.stringify({ scale: best.scale, tx: best.tx, ty: best.ty }, null, 2));
}

await main();
