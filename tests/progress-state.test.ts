import { describe, expect, test } from 'vitest';
import { countDone, isDone, setDone } from '@/lib/progress-state';
import type { ProgressMap } from '@/lib/types';

const now = '2026-08-20T10:00:00.000Z';
const base: ProgressMap = { 'spaceship-01': now };

describe('progress state', () => {
  test('isDone reflects presence', () => {
    expect(isDone(base, 'spaceship-01')).toBe(true);
    expect(isDone(base, 'spaceship-02')).toBe(false);
  });

  test('setDone adds an entry without mutating the input', () => {
    const next = setDone(base, 'letter-01', true, now);
    expect(next['letter-01']).toBe(now);
    expect(base['letter-01']).toBeUndefined();
  });

  test('setDone removes an entry', () => {
    const next = setDone(base, 'spaceship-01', false, now);
    expect(isDone(next, 'spaceship-01')).toBe(false);
  });

  test('setDone is idempotent', () => {
    expect(setDone(setDone(base, 'letter-01', true, now), 'letter-01', true, now)).toEqual(
      setDone(base, 'letter-01', true, now),
    );
  });

  test('countDone counts only the ids it is given', () => {
    const state = setDone(base, 'letter-01', true, now);
    expect(countDone(state, ['spaceship-01', 'spaceship-02', 'letter-01'])).toBe(2);
    expect(countDone(state, [])).toBe(0);
  });
});
