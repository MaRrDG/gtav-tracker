'use client';

import {
  BridgeIcon,
  CarProfileIcon,
  FlyingSaucerIcon,
  KnifeIcon,
  MapPinIcon,
  NoteIcon,
  RadioactiveIcon,
  ScrollIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/**
 * One glyph per category, drawn from the icon library rather than hand-written paths.
 * Markers are plain DOM built by Leaflet, so the icons are rendered once into a hidden
 * sprite and each pin references its symbol with <use>. That keeps 255 markers cheap and
 * avoids pulling a server renderer into the browser bundle to stringify components.
 */
const CATEGORY_ICONS: Record<string, Icon> = {
  spaceship: FlyingSaucerIcon,
  letter: NoteIcon,
  waste: RadioactiveIcon,
  stunt: CarProfileIcon,
  knife: KnifeIcon,
  bridge: BridgeIcon,
  epsilon: ScrollIcon,
};

/** Categories added later render this until they are given a glyph of their own. */
const FALLBACK_ICON = MapPinIcon;

export function symbolId(categoryId: string): string {
  return `pin-glyph-${categoryId}`;
}

export function PinSprite({ categoryIds }: { categoryIds: string[] }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      {categoryIds.map((id) => {
        const Glyph = CATEGORY_ICONS[id] ?? FALLBACK_ICON;
        return (
          <symbol key={id} id={symbolId(id)} viewBox="0 0 256 256">
            <Glyph size={256} weight="fill" color="currentColor" />
          </symbol>
        );
      })}
    </svg>
  );
}
