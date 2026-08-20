import type { Catalog, IndexedCatalog, Objective } from '@/lib/types';

/**
 * Pure, and deliberately free of JSON imports: client components need this function but
 * must not pull the whole catalog into the browser bundle alongside it.
 */
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
