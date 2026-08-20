export type Protagonist = 'michael' | 'franklin' | 'trevor';

export type Category = {
  id: string;
  name: string;
  /** Known total for the category, or null when it is not known yet. */
  expected: number | null;
};

export type Objective = {
  id: string;
  cat: string;
  name: string;
  /** Absent for objectives that are checklist-only. */
  lat?: number;
  lng?: number;
  notes: string;
  counts_for: string[];
  protagonist?: Protagonist;
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  platform: 'sp' | 'online';
  /** Present when the achievement completes itself from a category. */
  auto?: { cat: string; require: 'all' };
};

export type Catalog = {
  categories: Category[];
  locations: Objective[];
  achievements: Achievement[];
};

export type IndexedCatalog = Catalog & {
  byId: Map<string, Objective>;
  byCategory: Map<string, Objective[]>;
};

/** Completion timestamps keyed by objective id, as returned by the API. */
export type ProgressMap = Record<string, string>;
