// Dimension definition helpers — reduce boilerplate across dimension files.
//
// `dim(text, value, category, class?)` — build a single Dimension (field = value).
// `dims(category, entries)`            — build many Dimensions sharing one category.
// `dims(category, class, entries)`     — same, with a shared DimensionClass.

import { Dimension, DimensionClass, DimensionCategory } from '../metric_types';

/** Create a single Dimension. `field` is always set to `value`. */
export function dim(
  text: string,
  value: string,
  category: DimensionCategory,
  cls?: DimensionClass
): Dimension {
  const d: Dimension = { text, value, field: value, category };
  if (cls) {
    d.class = cls;
  }
  return d;
}

/**
 * Create an array of Dimensions that share the same category (and optionally class).
 *
 * Overload 1 — no shared class:
 *   dims(category, [ [text, value], … ])
 *   dims(category, [ [text, value, DimensionClass], … ])   ← per-entry class
 *
 * Overload 2 — shared class applied to all entries:
 *   dims(category, DimensionClass, [ [text, value], … ])
 */
export function dims(
  category: DimensionCategory,
  classOrEntries: DimensionClass | Array<[string, string] | [string, string, DimensionClass]>,
  maybeEntries?: Array<[string, string] | [string, string, DimensionClass]>
): Dimension[] {
  let defaultClass: DimensionClass | undefined;
  let entries: Array<[string, string] | [string, string, DimensionClass]>;

  if (typeof classOrEntries === 'string' && maybeEntries) {
    // Overload 2: dims(cat, cls, entries)
    defaultClass = classOrEntries as DimensionClass;
    entries = maybeEntries;
  } else {
    // Overload 1: dims(cat, entries)
    entries = classOrEntries as Array<[string, string] | [string, string, DimensionClass]>;
  }

  return entries.map(([text, value, cls]) => dim(text, value, category, cls ?? defaultClass));
}
