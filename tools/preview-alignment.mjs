/**
 * Draws the transformed objectives onto the map so the alignment can be judged by eye.
 *
 * Every proxy for correctness used while fitting is indirect: land masks confuse shallow
 * water with shore, and a score can be satisfied by a transform that is merely plausible.
 * A picture settles it.
 *
 * Usage: node tools/preview-alignment.mjs <scale> <tx> <ty> [out.jpg]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import jpeg from 'jpeg-js';

const ZOOM = 3;
const TILE = 256;
const GRID = 1 << ZOOM;
const SIZE = GRID * TILE;

const toNormalized = (lat, lng) => {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
};

const COLORS = {
  letter: [140, 20, 20],
  stunt: [255, 140, 0],
  waste: [40, 220, 60],
  spaceship: [140, 60, 220],
  knife: [0, 0, 0],
  bridge: [255, 0, 200],
  epsilon: [255, 255, 0],
  submarine: [255, 0, 0],
  package: [0, 0, 255],
};

async function main() {
  const [scale, tx, ty] = process.argv.slice(2, 5).map(Number);
  const out = process.argv[5] ?? 'alignment-preview.jpg';
  if (!Number.isFinite(scale)) {
    console.error('Usage: node tools/preview-alignment.mjs <scale> <tx> <ty> [out.jpg]');
    process.exit(1);
  }

  const canvas = Buffer.alloc(SIZE * SIZE * 4, 255);

  for (let tileX = 0; tileX < GRID; tileX += 1) {
    for (let tileY = 0; tileY < GRID; tileY += 1) {
      const path = `public/tiles/${ZOOM}/${tileX}/${tileY}.jpg`;
      if (!existsSync(path)) continue;
      const { data, width, height } = jpeg.decode(await readFile(path), { useTArray: true });

      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          const from = (py * width + px) * 4;
          const to = ((tileY * TILE + py) * SIZE + (tileX * TILE + px)) * 4;
          canvas[to] = data[from];
          canvas[to + 1] = data[from + 1];
          canvas[to + 2] = data[from + 2];
          canvas[to + 3] = 255;
        }
      }
    }
  }

  const locations = JSON.parse(await readFile('data/locations.json', 'utf8'));
  let drawn = 0;

  for (const item of locations) {
    if (typeof item.lat !== 'number') continue;
    const [nx, ny] = toNormalized(item.lat, item.lng);
    const cx = Math.round((nx * scale + tx) * SIZE);
    const cy = Math.round((ny * scale + ty) * SIZE);
    const [r, g, b] = COLORS[item.cat] ?? [0, 0, 0];

    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const i = (py * SIZE + px) * 4;
        canvas[i] = r;
        canvas[i + 1] = g;
        canvas[i + 2] = b;
      }
    }
    drawn += 1;
  }

  const encoded = jpeg.encode({ data: canvas, width: SIZE, height: SIZE }, 82);
  await writeFile(out, encoded.data);
  console.log(`Drew ${drawn} objectives onto ${out} (${SIZE}x${SIZE}).`);
  console.log('red submarine, blue packages, green waste, orange stunts, purple spaceship, pink bridge, yellow epsilon, dark red letters, black knife');
}

await main();
