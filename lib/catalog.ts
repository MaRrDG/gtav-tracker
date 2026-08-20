import categories from '@/data/categories.json';
import achievements from '@/data/achievements.json';
import locations from '@/data/locations.json';
import { indexCatalog } from '@/lib/catalog-index';
import type { Achievement, Catalog, Category, IndexedCatalog, Objective } from '@/lib/types';

export { indexCatalog };

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

let cached: IndexedCatalog | undefined;

/** The indexed catalog, built once per process. */
export function getIndexedCatalog(): IndexedCatalog {
  cached ??= indexCatalog(getCatalog());
  return cached;
}
