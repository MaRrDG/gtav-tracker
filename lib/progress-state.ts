import type { ProgressMap } from '@/lib/types';

export function isDone(state: ProgressMap, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, id);
}

/** Returns a new map. The caller keeps the previous one, which is what makes rollback cheap. */
export function setDone(
  state: ProgressMap,
  id: string,
  done: boolean,
  now: string,
): ProgressMap {
  if (done) return { ...state, [id]: now };
  const next = { ...state };
  delete next[id];
  return next;
}

export function countDone(state: ProgressMap, ids: string[]): number {
  let total = 0;
  for (const id of ids) if (isDone(state, id)) total += 1;
  return total;
}
