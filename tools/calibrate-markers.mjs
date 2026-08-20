/**
 * Calibrates the hand-placed marker set against canonical positions.
 *
 * Stunt Jumps, Knife Flights and Under the Bridge exist only in a marker set that was drawn
 * by hand on a different map, so they need a transform onto ours. Earlier that transform was
 * fitted against a land mask, which was too weak a signal and left everything shifted.
 *
 * Now there is something better to fit against. Four categories appear in both that marker
 * set and a source published in GTA V game coordinates, and game coordinates have a
 * published mapping onto these tiles. So those four categories give 140 points whose true
 * position is known, and the transform is fitted to them by iterative closest point.
 *
 * The residual is the evidence. It is reported in game metres, and it also measures how
 * accurately the original markers were placed by hand.
 *
 * Usage: node tools/calibrate-markers.mjs <collectathon config.lua> <danharper locations.json>
 */
import { readFile } from 'node:fs/promises';

const TILE_PIXELS = 256;
const CRS = { scaleX: 0.02072, centerX: 117.3, scaleY: 0.0205, centerY: 172.8 };

/** One normalized unit spans the world square; this converts a distance in it to game metres. */
const UNITS_TO_METRES = TILE_PIXELS / CRS.scaleX;

const gameToNormalized = (gx, gy) => [
  (gx * CRS.scaleX + CRS.centerX) / TILE_PIXELS,
  (CRS.centerY - gy * CRS.scaleY) / TILE_PIXELS,
];

const latLngToNormalized = (lat, lng) => {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  return [x, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
};

const SET_TO_CATEGORY = {
  LetterScraps: 'Letter Scrap',
  SpaceshipParts: 'Spaceship Part',
  NuclearWaste: 'Nuclear Waste',
  EpsilonTracts: 'Epsilon Tract',
};

function parseLua(lua) {
  const sets = {};
  for (const match of lua.matchAll(/(\w+)\s*=\s*\{\s*\n\s*enabled/g)) {
    const name = match[1];
    const itemsAt = lua.indexOf('items = {', lua.indexOf(`${name} = {`));
    if (itemsAt < 0) continue;
    const end = lua.indexOf('\n        }', itemsAt);
    const chunk = lua.slice(itemsAt, end < 0 ? lua.length : end);
    const coords = [
      ...chunk.matchAll(/vector3\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g),
    ].map((m) => [Number(m[1]), Number(m[2])]);
    if (coords.length > 0) sets[name] = coords;
  }
  return sets;
}

const apply = ({ sx, sy, tx, ty }, [x, y]) => [x * sx + tx, y * sy + ty];

function solve(pairs) {
  const fitAxis = (from, to) => {
    const n = from.length;
    const meanFrom = from.reduce((a, b) => a + b, 0) / n;
    const meanTo = to.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let variance = 0;
    for (let i = 0; i < n; i += 1) {
      cov += (from[i] - meanFrom) * (to[i] - meanTo);
      variance += (from[i] - meanFrom) ** 2;
    }
    const scale = cov / variance;
    return { scale, offset: meanTo - scale * meanFrom };
  };

  const x = fitAxis(pairs.map(([a]) => a[0]), pairs.map(([, b]) => b[0]));
  const y = fitAxis(pairs.map(([a]) => a[1]), pairs.map(([, b]) => b[1]));
  return { sx: x.scale, tx: x.offset, sy: y.scale, ty: y.offset };
}

function boxFit(from, to) {
  const axis = (index) => {
    const f = from.map((p) => p[index]);
    const t = to.map((p) => p[index]);
    const scale = (Math.max(...t) - Math.min(...t)) / (Math.max(...f) - Math.min(...f));
    return { scale, offset: Math.min(...t) - Math.min(...f) * scale };
  };
  const x = axis(0);
  const y = axis(1);
  return { sx: x.scale, tx: x.offset, sy: y.scale, ty: y.offset };
}

function nearest(point, cloud) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of cloud) {
    const distance = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return [best, Math.sqrt(bestDistance)];
}

function icp(from, to, start, passes = 20) {
  let fit = start;
  for (let pass = 0; pass < passes; pass += 1) {
    const pairs = from.map((point) => [point, nearest(apply(fit, point), to)[0]]);
    fit = solve(pairs);
  }
  return fit;
}

async function main(luaPath, markersPath) {
  const sets = parseLua(await readFile(luaPath, 'utf8'));
  const markers = JSON.parse(await readFile(markersPath, 'utf8'));

  const from = [];
  const to = [];

  for (const [setName, type] of Object.entries(SET_TO_CATEGORY)) {
    const coords = sets[setName];
    if (!coords) continue;
    to.push(...coords.map(([gx, gy]) => gameToNormalized(gx, gy)));
    from.push(
      ...markers
        .filter((m) => m.type === type)
        .map((m) => latLngToNormalized(m.lat, m.lng)),
    );
  }

  console.log(`Matching ${from.length} hand-placed markers against ${to.length} canonical points.`);

  const fit = icp(from, to, boxFit(from, to));
  const distances = from.map((point) => nearest(apply(fit, point), to)[1]).sort((a, b) => a - b);
  const metres = (value) => (value * UNITS_TO_METRES).toFixed(0);

  console.log(
    `residual: median ${metres(distances[Math.floor(distances.length / 2)])} m, ` +
      `p90 ${metres(distances[Math.floor(distances.length * 0.9)])} m, ` +
      `worst ${metres(distances[distances.length - 1])} m`,
  );
  console.log(`x and y scales differ by ${(Math.abs((Math.abs(fit.sx) - Math.abs(fit.sy)) / fit.sx) * 100).toFixed(2)}%`);
  console.log('\nHand-placed marker space to normalized map:');
  console.log(JSON.stringify(fit, null, 2));
}

const [lua, markers] = process.argv.slice(2);
if (!lua || !markers) {
  console.error('Usage: node tools/calibrate-markers.mjs <config.lua> <locations.json>');
  process.exit(1);
}

await main(lua, markers);
