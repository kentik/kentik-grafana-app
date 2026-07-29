/**
 * Dashboard template variable query resolver.
 *
 * Supports a small DSL, resolved entirely from the cached Dictionary metadata:
 *
 *   measurements()                              → all measurement names
 *   metrics(<measurement>)                      → metric keys for a measurement
 *   dimensions(<measurement>)                   → dimension keys for a measurement
 *   dimension_values(<measurement>, <dimension>) → known values for a dimension
 *
 * Arguments may themselves reference other dashboard variables; interpolation is
 * performed by the caller before invoking resolveVariableQuery.
 */
import { MetricFindValue } from '@grafana/data';
import { DictionaryResponse } from './dictionary_service';

const QUERY_PATTERN = /^\s*(\w+)\s*\(([^)]*)\)\s*$/;

function splitArgs(raw: string): string[] {
  return raw
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function toValues(pairs: Array<[string, string]>): MetricFindValue[] {
  return pairs.map(([value, text]) => ({ text: text || value, value }));
}

/**
 * Resolve a variable query string against the dictionary. Returns an empty list
 * for unknown functions or missing measurements rather than throwing, so a
 * mistyped variable query degrades gracefully in the dashboard editor.
 */
export function resolveVariableQuery(query: string, dict: DictionaryResponse): MetricFindValue[] {
  const match = QUERY_PATTERN.exec(query || '');
  if (!match) {
    return [];
  }

  const fn = match[1].toLowerCase();
  const args = splitArgs(match[2]);

  switch (fn) {
    case 'measurements':
      return toValues(dict.measurements.map((m) => [m.name, m.display_name || m.name]));

    case 'metrics': {
      const measurement = dict.measurements.find((m) => m.name === args[0]);
      if (!measurement) {
        return [];
      }
      return toValues(measurement.metrics.map((m) => [m.key, m.label || m.key]));
    }

    case 'dimensions': {
      const measurement = dict.measurements.find((m) => m.name === args[0]);
      if (!measurement) {
        return [];
      }
      return toValues(measurement.dimensions.filter((d) => !d.filter_only).map((d) => [d.key, d.label || d.key]));
    }

    case 'dimension_values': {
      const measurement = dict.measurements.find((m) => m.name === args[0]);
      const dimension = measurement?.dimensions.find((d) => d.key === args[1]);
      if (!dimension || !dimension.values) {
        return [];
      }
      return toValues(Object.entries(dimension.values));
    }

    default:
      return [];
  }
}
