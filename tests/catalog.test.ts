import { describe, expect, test } from 'vitest';
import { indexCatalog } from '@/lib/catalog';
import type { Catalog } from '@/lib/types';

const catalog: Catalog = {
  categories: [
    { id: 'spaceship', name: 'Spaceship Parts', expected: 2 },
    { id: 'letter', name: 'Letter Scraps', expected: 1 },
  ],
  achievements: [
    { id: 'from-beyond-the-stars', name: 'From Beyond the Stars', desc: '', platform: 'sp' },
  ],
  locations: [
    { id: 'spaceship-01', cat: 'spaceship', name: 'A', lat: 1, lng: 2, notes: '', counts_for: [] },
    { id: 'letter-01', cat: 'letter', name: 'B', lat: 3, lng: 4, notes: '', counts_for: [] },
    { id: 'spaceship-02', cat: 'spaceship', name: 'C', lat: 5, lng: 6, notes: '', counts_for: [] },
  ],
};

describe('indexCatalog', () => {
  test('indexes objectives by id', () => {
    const indexed = indexCatalog(catalog);
    expect(indexed.byId.get('letter-01')?.name).toBe('B');
    expect(indexed.byId.size).toBe(3);
  });

  test('groups objectives by category, preserving file order', () => {
    const indexed = indexCatalog(catalog);
    expect(indexed.byCategory.get('spaceship')?.map((l) => l.id)).toEqual([
      'spaceship-01',
      'spaceship-02',
    ]);
  });

  test('gives every declared category an entry, even an empty one', () => {
    const indexed = indexCatalog({ ...catalog, locations: [] });
    expect(indexed.byCategory.get('letter')).toEqual([]);
  });
});
