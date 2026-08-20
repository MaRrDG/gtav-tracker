import { readFile } from 'node:fs/promises';
import type { Achievement, Category, Objective } from '@/lib/types';

// Leaflet's default CRS clamps latitude to the Web Mercator limit.
const LAT_LIMIT = 85.06;
const LNG_LIMIT = 180;

type Input = { locations: Objective[]; achievements: Achievement[]; categories: Category[] };

export function validateData({ locations, achievements, categories }: Input): string[] {
  const errors: string[] = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const achievementIds = new Set(achievements.map((a) => a.id));
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const item of locations) {
    const where = item.id || '(missing id)';
    if (!item.id) errors.push('objective with no id');
    else if (seen.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    else seen.add(item.id);

    if (!item.name) errors.push(`${where}: missing name`);

    if (!categoryIds.has(item.cat)) {
      errors.push(`${where}: unknown category: ${item.cat}`);
    } else {
      counts.set(item.cat, (counts.get(item.cat) ?? 0) + 1);
    }

    // Coordinates are optional: an objective without them is checklist-only.
    const hasLat = typeof item.lat === 'number';
    const hasLng = typeof item.lng === 'number';
    if (hasLat !== hasLng) {
      errors.push(`${where}: has only one of lat/lng`);
    } else if (hasLat && hasLng) {
      if (Math.abs(item.lat!) > LAT_LIMIT || Math.abs(item.lng!) > LNG_LIMIT) {
        errors.push(`${where}: coordinates out of bounds (${item.lat}, ${item.lng})`);
      }
    }

    for (const ref of item.counts_for ?? []) {
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
    const found = counts.get(category.id) ?? 0;
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

async function main(): Promise<void> {
  const read = async (name: string) =>
    JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

  const [locations, achievements, categories] = await Promise.all([
    read('locations'),
    read('achievements'),
    read('categories'),
  ]);

  const errors = validateData({ locations, achievements, categories });
  if (errors.length > 0) {
    console.error(`${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(
    `Data is valid: ${locations.length} objectives across ${categories.length} categories.`,
  );
}

// tsx sets argv[1] to this file when it is run directly, not when it is imported.
if (process.argv[1]?.endsWith('validate.ts')) {
  await main();
}
