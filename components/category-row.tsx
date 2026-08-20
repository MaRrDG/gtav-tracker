'use client';

import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import type { Category, Objective, ProgressMap } from '@/lib/types';
import { countDone } from '@/lib/progress-state';
import { Tally } from '@/components/tally';

type Props = {
  category: Category;
  objectives: Objective[];
  progress: ProgressMap;
  visible: boolean;
  onToggleVisibility: (id: string) => void;
  onFocus: (objectiveId: string) => void;
};

export function CategoryRow({
  category,
  objectives,
  progress,
  visible,
  onToggleVisibility,
  onFocus,
}: Props) {
  const ids = objectives.map((objective) => objective.id);
  const done = countDone(progress, ids);

  return (
    <li className="category">
      <div className="category__head">
        <button
          type="button"
          className="category__visibility"
          aria-pressed={visible}
          aria-label={visible ? `Hide ${category.name}` : `Show ${category.name}`}
          onClick={() => onToggleVisibility(category.id)}
        >
          {visible ? <EyeIcon size={16} weight="bold" /> : <EyeSlashIcon size={16} weight="bold" />}
        </button>
        <span className="category__name">{category.name}</span>
        <span className="category__count num">
          {done}/{ids.length}
        </span>
      </div>
      <Tally objectives={objectives} progress={progress} onFocus={onFocus} />
    </li>
  );
}
