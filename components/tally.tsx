'use client';

import type { Objective, ProgressMap } from '@/lib/types';
import { isDone } from '@/lib/progress-state';

type Props = {
  objectives: Objective[];
  progress: ProgressMap;
  onFocus: (objectiveId: string) => void;
};

/**
 * One cell per objective. Shows not just how many are missing but which, and clicking a
 * cell takes the map to it. This replaces a progress bar rather than sitting beside one.
 */
export function Tally({ objectives, progress, onFocus }: Props) {
  return (
    <div className="tally">
      {objectives.map((objective) => {
        const done = isDone(progress, objective.id);
        return (
          <button
            key={objective.id}
            type="button"
            className={`tally__cell${done ? ' tally__cell--done' : ''}`}
            aria-label={`${objective.name}. ${done ? 'Done' : 'Not done'}. Show on map.`}
            onClick={() => onFocus(objective.id)}
          />
        );
      })}
    </div>
  );
}
