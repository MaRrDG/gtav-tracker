'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Catalog, ProgressMap } from '@/lib/types';
import { indexCatalog } from '@/lib/catalog-index';
import { isDone, setDone } from '@/lib/progress-state';
import { putObjective } from '@/lib/progress-client';

// Leaflet reaches for window at import time, so it never renders on the server.
const MapView = dynamic(() => import('@/components/map-view'), { ssr: false });

type Props = {
  catalog: Catalog;
  initialProgress: ProgressMap;
  email: string;
};

export function Tracker({ catalog, initialProgress, email }: Props) {
  const indexed = useMemo(() => indexCatalog(catalog), [catalog]);
  const [progress, setProgress] = useState(initialProgress);
  const [visible, setVisible] = useState(
    () => new Set(catalog.categories.map((category) => category.id)),
  );
  const [hideCompleted, setHideCompleted] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read through a ref rather than a state updater: updaters run twice under StrictMode,
  // which would capture an already-changed map as the value to roll back to.
  const current = useRef(progress);
  current.current = progress;

  const toggle = useCallback(async (id: string) => {
    const previous = current.current;
    const next = !isDone(previous, id);

    setProgress(setDone(previous, id, next, new Date().toISOString()));
    setError(null);

    try {
      await putObjective(id, next);
    } catch (failure) {
      // The interface never claims a save that did not happen.
      setProgress(previous);
      setError(failure instanceof Error ? failure.message : 'Could not save. Retry.');
    }
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setVisible((currentSet) => {
      const nextSet = new Set(currentSet);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }, []);

  return (
    <div className="layout">
      {/* The panel arrives in the next task. */}
      <aside className="panel">
        <p>{email}</p>
        <p>{indexed.categories.length} categories</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={() => toggleCategory('spaceship')}>
          Toggle spaceship
        </button>
        <label>
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => setHideCompleted(event.target.checked)}
          />
          Hide completed
        </label>
        <button type="button" onClick={() => setFocusId('spaceship-01')}>
          Focus first
        </button>
      </aside>
      <MapView
        objectives={catalog.locations}
        visible={visible}
        progress={progress}
        hideCompleted={hideCompleted}
        focusId={focusId}
        onToggle={toggle}
      />
    </div>
  );
}
