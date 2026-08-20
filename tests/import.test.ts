import { describe, expect, test } from 'vitest';
import { convertEntries, type UpstreamEntry } from '@/tools/import-danharper';

const upstream: UpstreamEntry[] = [
  {
    id: 1,
    type: 'Spaceship Part',
    title: 'Spaceship Part #1 - Mount Chiliad',
    lat: 83.1,
    lng: -120.5,
    notes: 'By the barns',
  },
  { id: 2, type: 'Spaceship Part', title: 'Spaceship Part #2', lat: 80, lng: -119 },
  { id: 3, type: 'Money', title: 'Briefcase', lat: 70, lng: -110 },
  { id: 4, type: 'Letter Scrap', title: 'Letter Scrap #1', lat: 75, lng: -115, notes: '' },
];

describe('convertEntries', () => {
  test('maps upstream types onto our categories', () => {
    const { locations } = convertEntries(upstream);
    expect(locations).toHaveLength(3);
    expect(locations.map((l) => l.cat)).toEqual(['spaceship', 'spaceship', 'letter']);
  });

  test('numbers ids per category, zero-padded', () => {
    const { locations } = convertEntries(upstream);
    expect(locations.map((l) => l.id)).toEqual(['spaceship-01', 'spaceship-02', 'letter-01']);
  });

  test('keeps the upstream title, coordinates and notes', () => {
    const [first] = convertEntries(upstream).locations;
    expect(first.name).toBe('Spaceship Part #1 - Mount Chiliad');
    expect(first.lat).toBe(83.1);
    expect(first.lng).toBe(-120.5);
    expect(first.notes).toBe('By the barns');
  });

  test('defaults missing notes to an empty string', () => {
    expect(convertEntries(upstream).locations[1].notes).toBe('');
  });

  test('links each objective to 100% and to its achievement', () => {
    expect(convertEntries(upstream).locations[0].counts_for).toEqual([
      '100%',
      'ach:from-beyond-the-stars',
    ]);
  });

  test('omits the achievement link for a category that has none', () => {
    const knife: UpstreamEntry[] = [
      { id: 9, type: 'Knife Flight', title: 'Knife Flight #1', lat: 70, lng: -120 },
    ];
    expect(convertEntries(knife).locations[0].counts_for).toEqual(['100%']);
  });

  test('reports the upstream types it skipped', () => {
    expect(convertEntries(upstream).skipped).toEqual(['Money']);
  });
});
