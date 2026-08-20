import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../tools/validate.js';

const categories = [
  { id: 'spaceship', name: 'Spaceship Parts', expected: 2 },
  { id: 'knife', name: 'Knife Flights', expected: null },
];
const achievements = [
  { id: 'from-beyond-the-stars', name: 'From Beyond the Stars', desc: '', platform: 'sp',
    auto: { cat: 'spaceship', require: 'all' } },
];
const loc = (over) => ({
  id: 'spaceship-01', cat: 'spaceship', name: 'Spaceship Part #1',
  lat: 83.1, lng: -120.5, notes: '', counts_for: ['100%'], ...over,
});

test('accepts valid data', () => {
  const locations = [loc(), loc({ id: 'spaceship-02', name: 'Spaceship Part #2' })];
  assert.deepEqual(validateData({ locations, achievements, categories }), []);
});

test('rejects duplicate ids', () => {
  const locations = [loc(), loc()];
  const errors = validateData({ locations, achievements, categories });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate id: spaceship-01/);
});

test('rejects an unknown category', () => {
  const locations = [loc({ cat: 'peyote' }), loc({ id: 'spaceship-02' })];
  const errors = validateData({ locations, achievements, categories });
  assert.match(errors.join('\n'), /unknown category: peyote/);
});

test('rejects a category count that misses its expected total', () => {
  const locations = [loc()];
  const errors = validateData({ locations, achievements, categories });
  assert.match(errors.join('\n'), /spaceship: expected 2, found 1/);
});

test('skips the count check when expected is null', () => {
  const locations = [
    loc(), loc({ id: 'spaceship-02' }),
    { id: 'knife-01', cat: 'knife', name: 'Knife Flight #1', lat: 70, lng: -120, notes: '', counts_for: ['100%'] },
  ];
  assert.deepEqual(validateData({ locations, achievements, categories }), []);
});

test('rejects coordinates outside the map bounds', () => {
  const locations = [loc({ lat: 91 }), loc({ id: 'spaceship-02' })];
  const errors = validateData({ locations, achievements, categories });
  assert.match(errors.join('\n'), /coordinates out of bounds/);
});

test('rejects a counts_for reference to an unknown achievement', () => {
  const locations = [loc({ counts_for: ['100%', 'ach:nope'] }), loc({ id: 'spaceship-02' })];
  const errors = validateData({ locations, achievements, categories });
  assert.match(errors.join('\n'), /unknown achievement: nope/);
});

test('rejects an achievement rule naming an unknown category', () => {
  const locations = [loc(), loc({ id: 'spaceship-02' })];
  const bad = [{ ...achievements[0], auto: { cat: 'peyote', require: 'all' } }];
  const errors = validateData({ locations, achievements: bad, categories });
  assert.match(errors.join('\n'), /unknown category: peyote/);
});
