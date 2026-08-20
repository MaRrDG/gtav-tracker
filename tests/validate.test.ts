import { describe, expect, test } from 'vitest';
import { validateData } from '@/tools/validate';
import type { Achievement, Category, Objective } from '@/lib/types';

const categories: Category[] = [
  { id: 'spaceship', name: 'Spaceship Parts', expected: 2 },
  { id: 'knife', name: 'Knife Flights', expected: null },
];

const achievements: Achievement[] = [
  {
    id: 'from-beyond-the-stars',
    name: 'From Beyond the Stars',
    desc: '',
    platform: 'sp',
    auto: { cat: 'spaceship', require: 'all' },
  },
];

const loc = (over: Partial<Objective> = {}): Objective => ({
  id: 'spaceship-01',
  cat: 'spaceship',
  name: 'Spaceship Part #1',
  lat: 83.1,
  lng: -120.5,
  notes: '',
  counts_for: ['100%'],
  ...over,
});

const run = (locations: Objective[], achs = achievements) =>
  validateData({ locations, achievements: achs, categories });

describe('validateData', () => {
  test('accepts valid data', () => {
    expect(run([loc(), loc({ id: 'spaceship-02', name: 'Spaceship Part #2' })])).toEqual([]);
  });

  test('rejects duplicate ids', () => {
    const errors = run([loc(), loc()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate id: spaceship-01/);
  });

  test('rejects an unknown category', () => {
    expect(run([loc({ cat: 'peyote' }), loc({ id: 'spaceship-02' })]).join('\n')).toMatch(
      /unknown category: peyote/,
    );
  });

  test('rejects a category count that misses its expected total', () => {
    expect(run([loc()]).join('\n')).toMatch(/spaceship: expected 2, found 1/);
  });

  test('skips the count check when expected is null', () => {
    expect(
      run([
        loc(),
        loc({ id: 'spaceship-02' }),
        {
          id: 'knife-01',
          cat: 'knife',
          name: 'Knife Flight #1',
          lat: 70,
          lng: -120,
          notes: '',
          counts_for: ['100%'],
        },
      ]),
    ).toEqual([]);
  });

  test('rejects coordinates outside the map bounds', () => {
    expect(run([loc({ lat: 91 }), loc({ id: 'spaceship-02' })]).join('\n')).toMatch(
      /coordinates out of bounds/,
    );
  });

  test('rejects a counts_for reference to an unknown achievement', () => {
    expect(
      run([loc({ counts_for: ['100%', 'ach:nope'] }), loc({ id: 'spaceship-02' })]).join('\n'),
    ).toMatch(/unknown achievement: nope/);
  });

  test('rejects an achievement rule naming an unknown category', () => {
    const bad: Achievement[] = [{ ...achievements[0], auto: { cat: 'peyote', require: 'all' } }];
    expect(run([loc(), loc({ id: 'spaceship-02' })], bad).join('\n')).toMatch(
      /unknown category: peyote/,
    );
  });

  test('accepts an objective with no coordinates', () => {
    const checklistOnly: Objective = {
      id: 'spaceship-02',
      cat: 'spaceship',
      name: 'Checklist item',
      notes: '',
      counts_for: ['100%'],
    };
    expect(run([loc(), checklistOnly])).toEqual([]);
  });
});
