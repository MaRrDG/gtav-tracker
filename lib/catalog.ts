import categories from '@/data/categories.json';
import achievements from '@/data/achievements.json';
import locations from '@/data/locations.json';
import type { Achievement, Catalog, Category, IndexedCatalog, Objective } from '@/lib/types';

/**
 * The catalog is bundled rather than read from disk: it is identical for every user and
 * changes only when the repository does, so it needs no I/O at request time.
 */
export function getCatalog(): Catalog {
  return {
    categories: categories as Category[],
    achievements: achievements as Achievement[],
    locations: locations as Objective[],
  };
}

export function indexCatalog(catalog: Catalog): IndexedCatalog {
  const byId = new Map<string, Objective>();
  const byCategory = new Map<string, Objective[]>(
    catalog.categories.map((category) => [category.id, []]),
  );

  for (const objective of catalog.locations) {
    byId.set(objective.id, objective);
    byCategory.get(objective.cat)?.push(objective);
  }

  return { ...catalog, byId, byCategory };
}

let cached: IndexedCatalog | undefined;

/** The indexed catalog, built once per process. */
export function getIndexedCatalog(): IndexedCatalog {
  cached ??= indexCatalog(getCatalog());
  return cached;
}
