import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Leaflet's default CRS clamps latitude to the Web Mercator limit.
const LAT_LIMIT = 85.06;
const LNG_LIMIT = 180;

export function validateData({ locations, achievements, categories }) {
  const errors = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const achievementIds = new Set(achievements.map((a) => a.id));
  const seen = new Set();
  const counts = new Map();

  for (const item of locations) {
    const where = item.id || '(missing id)';
    if (!item.id) errors.push('location with no id');
    else if (seen.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    else seen.add(item.id);

    if (!item.name) errors.push(`${where}: missing name`);

    if (!categoryIds.has(item.cat)) {
      errors.push(`${where}: unknown category: ${item.cat}`);
    } else {
      counts.set(item.cat, (counts.get(item.cat) || 0) + 1);
    }

    const hasCoords = typeof item.lat === 'number' && typeof item.lng === 'number';
    if (!hasCoords) {
      errors.push(`${where}: missing coordinates`);
    } else if (Math.abs(item.lat) > LAT_LIMIT || Math.abs(item.lng) > LNG_LIMIT) {
      errors.push(`${where}: coordinates out of bounds (${item.lat}, ${item.lng})`);
    }

    for (const ref of item.counts_for || []) {
      if (ref === '100%') continue;
      if (!ref.startsWith('ach:')) {
        errors.push(`${where}: malformed counts_for entry: ${ref}`);
        continue;
      }
      const id = ref.slice(4);
      if (!achievementIds.has(id)) errors.push(`${where}: unknown achievement: ${id}`);
    }
  }

  for (const category of categories) {
    if (category.expected == null) continue;
    const found = counts.get(category.id) || 0;
    if (found !== category.expected) {
      errors.push(`${category.id}: expected ${category.expected}, found ${found}`);
    }
  }

  for (const achievement of achievements) {
    if (!achievement.auto) continue;
    if (!categoryIds.has(achievement.auto.cat)) {
      errors.push(`${achievement.id}: unknown category: ${achievement.auto.cat}`);
    }
    if (achievement.auto.require !== 'all') {
      errors.push(`${achievement.id}: unsupported rule: ${achievement.auto.require}`);
    }
  }

  return errors;
}

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

// Runs the checks against the real data files when invoked directly, not when imported.
const invokedDirectly = process.argv[1]
  && (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)));

if (invokedDirectly) {
  const [locations, achievements, categories] = await Promise.all([
    readJson('../data/locations.json'),
    readJson('../data/achievements.json'),
    readJson('../data/categories.json'),
  ]);
  const errors = validateData({ locations, achievements, categories });
  if (errors.length) {
    console.error(`${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(`Data is valid: ${locations.length} objectives across ${categories.length} categories.`);
}
