'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Objective, ProgressMap } from '@/lib/types';
import { isDone } from '@/lib/progress-state';

const MIN_ZOOM = 0;
const MAX_ZOOM = 5;
const HOME: { center: L.LatLngExpression; zoom: number } = { center: [72, -122], zoom: 3 };

// A square pin, matching the shape lock. Filled with the accent, hollow once done.
function pinIcon(done: boolean) {
  return L.divIcon({
    className: `pin${done ? ' pin--done' : ''}`,
    html: '<span class="pin__body"></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

// The catalog is ours, but it is still data flowing into innerHTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function popupHtml(objective: Objective, done: boolean): string {
  const notes = objective.notes ? `<p class="popup__notes">${escapeHtml(objective.notes)}</p>` : '';
  return `<div class="popup">
    <h2 class="popup__name">${escapeHtml(objective.name)}</h2>
    ${notes}
    <button type="button" data-toggle>${done ? 'Mark not done' : 'Mark done'}</button>
  </div>`;
}

type Props = {
  objectives: Objective[];
  visible: Set<string>;
  progress: ProgressMap;
  hideCompleted: boolean;
  focusId: string | null;
  onToggle: (id: string) => void;
};

export default function MapView({
  objectives,
  visible,
  progress,
  hideCompleted,
  focusId,
  onToggle,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const layers = useRef(new Map<string, L.LayerGroup>());

  // Kept in refs so the markers, which are built once, always read current values without
  // being rebuilt whenever a handler identity or the progress map changes.
  const toggle = useRef(onToggle);
  toggle.current = onToggle;
  const latestProgress = useRef(progress);
  latestProgress.current = progress;

  // Create the map once.
  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = L.map(container.current, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    }).setView(HOME.center, HOME.zoom);

    L.tileLayer('/tiles/{z}/{x}/{y}.jpg', {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      noWrap: true,
    }).addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      layers.current.clear();
    };
  }, []);

  // Build one marker per objective, once.
  useEffect(() => {
    if (!map.current) return;

    for (const objective of objectives) {
      if (objective.lat === undefined || objective.lng === undefined) continue;
      if (markers.current.has(objective.id)) continue;

      const marker = L.marker([objective.lat, objective.lng], { icon: pinIcon(false) });
      marker.bindPopup(() => popupHtml(objective, isDone(latestProgress.current, objective.id)), {
        closeButton: false,
      });
      marker.on('popupopen', (event) => {
        const button = event.popup.getElement()?.querySelector('[data-toggle]');
        button?.addEventListener('click', () => {
          toggle.current(objective.id);
          marker.closePopup();
        });
      });

      markers.current.set(objective.id, marker);

      let layer = layers.current.get(objective.cat);
      if (!layer) {
        layer = L.layerGroup();
        layers.current.set(objective.cat, layer);
      }
      layer.addLayer(marker);
    }
  }, [objectives]);

  // Reflect visibility, completion and the hide-completed switch.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const [cat, layer] of layers.current) {
      if (visible.has(cat)) layer.addTo(instance);
      else instance.removeLayer(layer);
    }

    for (const objective of objectives) {
      const marker = markers.current.get(objective.id);
      if (!marker) continue;

      const done = isDone(progress, objective.id);
      marker.setIcon(pinIcon(done));

      const layer = layers.current.get(objective.cat);
      if (!layer) continue;

      const shouldShow = !(done && hideCompleted);
      if (shouldShow && !layer.hasLayer(marker)) layer.addLayer(marker);
      if (!shouldShow && layer.hasLayer(marker)) layer.removeLayer(marker);
    }
  }, [objectives, visible, progress, hideCompleted]);

  // Fly to the objective the panel asked for.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focusId) return;

    const objective = objectives.find((item) => item.id === focusId);
    if (!objective || objective.lat === undefined || objective.lng === undefined) return;

    const target: L.LatLngExpression = [objective.lat, objective.lng];
    const zoom = Math.max(instance.getZoom(), 4);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (still) instance.setView(target, zoom);
    else instance.flyTo(target, zoom, { duration: 0.6 });

    markers.current.get(focusId)?.openPopup();
  }, [focusId, objectives]);

  return <div ref={container} className="map" />;
}
