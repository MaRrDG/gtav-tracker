'use client';

import { SignOutIcon } from '@phosphor-icons/react';
import type { IndexedCatalog, ProgressMap } from '@/lib/types';
import { countDone } from '@/lib/progress-state';
import { CategoryRow } from '@/components/category-row';

type Props = {
  indexed: IndexedCatalog;
  progress: ProgressMap;
  visible: Set<string>;
  hideCompleted: boolean;
  collapsed: boolean;
  email: string;
  error: string | null;
  onToggleCategory: (id: string) => void;
  onHideCompleted: (value: boolean) => void;
  onCollapsedChange: (value: boolean) => void;
  onFocus: (objectiveId: string) => void;
};

export function Panel({
  indexed,
  progress,
  visible,
  hideCompleted,
  collapsed,
  email,
  error,
  onToggleCategory,
  onHideCompleted,
  onCollapsedChange,
  onFocus,
}: Props) {
  const allIds = indexed.locations.map((objective) => objective.id);
  const done = countDone(progress, allIds);
  const percent = allIds.length === 0 ? 0 : Math.round((done / allIds.length) * 100);
  const complete = allIds.length > 0 && done === allIds.length;

  return (
    <aside className="panel" data-collapsed={collapsed}>
      <button
        type="button"
        className="panel__handle"
        aria-expanded={!collapsed}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <span className="num">{percent}%</span> complete
      </button>

      <header className="panel__header">
        <p className={`readout__percent num${complete ? ' readout__percent--complete' : ''}`}>
          {percent}%
        </p>
        <p className="readout__caption">
          <span className="num">{done}</span> of <span className="num">{allIds.length}</span>{' '}
          objectives. This tracker counts them, the game counts its own way.
        </p>
      </header>

      <div className="panel__controls">
        <label className="control">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => onHideCompleted(event.target.checked)}
          />
          <span>Hide completed</span>
        </label>
      </div>

      {error && (
        <p className="panel__error" role="alert">
          {error}
        </p>
      )}

      <ul className="categories">
        {indexed.categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            objectives={indexed.byCategory.get(category.id) ?? []}
            progress={progress}
            visible={visible.has(category.id)}
            onToggleVisibility={onToggleCategory}
            onFocus={onFocus}
          />
        ))}
      </ul>

      <footer className="panel__footer">
        <span className="panel__email">{email}</span>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="panel__signout">
            <SignOutIcon size={14} weight="bold" />
            Sign out
          </button>
        </form>
      </footer>
    </aside>
  );
}
