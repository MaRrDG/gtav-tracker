/**
 * Calibrates GTA V game world coordinates against our tile set.
 *
 * Game coordinates are the canonical space: mods and FiveM resources publish objectives in
 * them, so a mapping from game space to our map unlocks every such dataset. The mapping is
 * axis-aligned affine, four unknowns, with y flipped because game north is up and map y
 * grows downward.
 *
 * It is fitted, not guessed. Four categories exist in both our data and the source, so the
 * same physical points appear twice. The point clouds are matched with iterative closest
 * point starting from a bounding-box alignment, and the residual error is reported: that
 * number is the evidence. A correct mapping leaves residuals near zero.
 *
 * Usage: node tools/calibrate-game-coords.mjs <path-to-collectathon-config.lua>
 */
import { readFile } from 'node:fs/promises';

const toNormalized = (lat, lng) => {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
};

/** Source set name to our category id. */
const SET_TO_CATEGORY = {
  LetterScraps: 'letter',
  SpaceshipParts: 'spaceship',
  NuclearWaste: 'waste',
  EpsilonTracts: 'epsilon',
  SubParts: 'submarine',
  HiddenPackages: 'package',
};

export function parseConfig(lua) {
  const sets = {};

  for (const match of lua.matchAll(/(\w+)\s*=\s*\{\s*\n\s*enabled/g)) {
    const setName = match[1];
    const start = lua.indexOf(`${setName} = {`);
    const itemsAt = lua.indexOf('items = {', start);
    if (itemsAt < 0) continue;

    // The items table ends at the first closing brace on its own indented line.
    const end = lua.indexOf('\n        }', itemsAt);
    const chunk = lua.slice(itemsAt, end < 0 ? lua.length : end);

    const coords = [...chunk.matchAll(/vector3\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)].map(
      (m) => [Number(m[1]), Number(m[2])],
    );

    if (coords.length > 0) sets[setName] = coords;
  }

  return sets;
}

const applyFit = ({ sx, sy, tx, ty }, [gx, gy]) => [gx * sx + tx, gy * sy + ty];

/** Least squares for an axis-aligned affine, given matched pairs. */
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

  const x = fitAxis(pairs.map(([g]) => g[0]), pairs.map(([, t]) => t[0]));
  const y = fitAxis(pairs.map(([g]) => g[1]), pairs.map(([, t]) => t[1]));
  return { sx: x.scale, tx: x.offset, sy: y.scale, ty: y.offset };
}

function boundingBoxFit(game, target) {
  const box = (points, axis) => {
    const values = points.map((p) => p[axis]);
    return [Math.min(...values), Math.max(...values)];
  };

  const fitAxis = (axis, flip) => {
    const [gLo, gHi] = box(game, axis);
    const [tLo, tHi] = box(target, axis);
    const scale = ((tHi - tLo) / (gHi - gLo)) * (flip ? -1 : 1);
    const offset = flip ? tLo - gHi * scale : tLo - gLo * scale;
    return { scale, offset };
  };

  const x = fitAxis(0, false);
  const y = fitAxis(1, true); // game north is up, map y grows downward
  return { sx: x.scale, tx: x.offset, sy: y.scale, ty: y.offset };
}

/** Iterative closest point: no correspondence is known, so it is discovered. */
function icp(game, target, start, passes = 12) {
  let fit = start;

  for (let pass = 0; pass < passes; pass += 1) {
    const pairs = [];
    for (const point of game) {
      const [px, py] = applyFit(fit, point);
      let bestDistance = Infinity;
      let best = null;
      for (const candidate of target) {
        const distance = (candidate[0] - px) ** 2 + (candidate[1] - py) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      pairs.push([point, best]);
    }
    fit = solve(pairs);
  }

  return fit;
}

function residuals(game, target, fit) {
  const distances = game.map((point) => {
    const [px, py] = applyFit(fit, point);
    let best = Infinity;
    for (const candidate of target) {
      best = Math.min(best, Math.hypot(candidate[0] - px, candidate[1] - py));
    }
    return best;
  });

  distances.sort((a, b) => a - b);
  return {
    median: distances[Math.floor(distances.length / 2)],
    p90: distances[Math.floor(distances.length * 0.9)],
    worst: distances[distances.length - 1],
  };
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: node tools/calibrate-game-coords.mjs <collectathon config.lua>');
    process.exit(1);
  }

  const sets = parseConfig(await readFile(source, 'utf8'));
  console.log('Source sets:');
  for (const [name, coords] of Object.entries(sets)) {
    console.log(`  ${name}: ${coords.length} -> ${SET_TO_CATEGORY[name] ?? '(unmapped)'}`);
  }

  const locations = JSON.parse(await readFile('data/locations.json', 'utf8'));

  // Categories present on both sides carry the same physical points twice.
  const shared = ['letter', 'spaceship', 'waste', 'epsilon'];
  const game = [];
  const target = [];

  for (const [setName, coords] of Object.entries(sets)) {
    const category = SET_TO_CATEGORY[setName];
    if (!shared.includes(category)) continue;
    game.push(...coords);
    for (const item of locations.filter((l) => l.cat === category)) {
      target.push(toNormalized(item.lat, item.lng));
    }
  }

  console.log(`\nMatching ${game.length} source points against ${target.length} of ours.`);

  const start = boundingBoxFit(game, target);
  console.log(`box start: median residual ${residuals(game, target, start).median.toFixed(5)}`);

  const fit = icp(game, target, start);
  const error = residuals(game, target, fit);

  // One normalized unit is the whole world square; the map is about 8 km across.
  const unitsToMetres = 8000 / (Math.abs(fit.sx) * 8000 + 1e-9);
  console.log(`\nresiduals in normalized units: median ${error.median.toFixed(5)}, p90 ${error.p90.toFixed(5)}, worst ${error.worst.toFixed(5)}`);
  console.log(`median residual is roughly ${(error.median * unitsToMetres * Math.abs(fit.sx) * 8000).toFixed(0)} game metres`);

  console.log('\nGame coordinates to normalized map:');
  console.log(JSON.stringify(fit, null, 2));

  if (error.median > 0.004) {
    console.log('\nResiduals are too large for this to be the real mapping. Do not use it.');
  }
}

await main();
