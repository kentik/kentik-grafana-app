import React, { useMemo } from 'react';
import { MultiCombobox, ComboboxOption } from '@grafana/ui';
import { DimensionField } from '../dictionary_service';

const NS_PREFIX = 'ktappprotocol__';

/** Extract the app-protocol namespace from a field key, or '' for universal. */
function extractNamespace(key: string): string {
  if (!key.startsWith(NS_PREFIX)) {
    return '';
  }
  const rest = key.slice(NS_PREFIX.length);
  const idx = rest.indexOf('__');
  return idx >= 0 ? rest.slice(0, idx) : '';
}

interface Props {
  dimensions: DimensionField[];
  value: string[];
  onChange: (dimensions: string[]) => void;
  /** Currently selected metric keys — used to detect cross-namespace conflicts. */
  selectedMetrics?: string[];
}

export const DimensionsPicker: React.FC<Props> = ({ dimensions, value, onChange, selectedMetrics }) => {
  // Determine the metric namespaces so we can warn on cross-namespace dims.
  const metricNamespaces = useMemo(() => {
    const ns = new Set<string>();
    for (const m of selectedMetrics || []) {
      const n = extractNamespace(m);
      if (n) {
        ns.add(n);
      }
    }
    return ns;
  }, [selectedMetrics]);

  const options = useMemo(() => {
    // Several dimensions can share the same display label (e.g. multiple "Site"
    // or "Account" variants). Track label frequency so duplicates can be
    // disambiguated by key — otherwise users can't tell which one to pick.
    const labelCounts = new Map<string, number>();
    for (const d of dimensions) {
      if (d.filter_only) {
        continue;
      }
      const label = d.label || d.key;
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }

    const grouped = new Map<string, DimensionField[]>();
    for (const d of dimensions) {
      if (d.filter_only) {
        continue;
      }
      const category = d.category || 'Other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(d);
    }

    const compatible: ComboboxOption[] = [];
    const incompatible: ComboboxOption[] = [];
    const sortedCategories = Array.from(grouped.keys()).sort();

    for (const category of sortedCategories) {
      const items = grouped.get(category)!;
      for (const item of items.sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key))) {
        const baseLabel = item.label || item.key;
        const isDuplicate = (labelCounts.get(baseLabel) || 0) > 1;
        let label = isDuplicate ? `${baseLabel} (${item.key})` : baseLabel;

        // If this dimension has a namespace that conflicts with the selected
        // metrics' namespace, mark it and move to the bottom.
        const dimNS = extractNamespace(item.key);
        const isConflict = dimNS !== '' && metricNamespaces.size > 0 && !metricNamespaces.has(dimNS);

        if (isConflict) {
          label = `⚠️ ${label} [${dimNS} — may conflict]`;
        }

        const opt: ComboboxOption = {
          label,
          value: item.key,
          description: isConflict ? `${category} — cross-namespace (${dimNS})` : category,
        };
        (isConflict ? incompatible : compatible).push(opt);
      }
    }

    // Show compatible first, conflicting at the bottom.
    return [...compatible, ...incompatible];
  }, [dimensions, metricNamespaces]);

  return (
    <MultiCombobox
      options={options}
      value={value}
      onChange={(selected) => {
        onChange(selected.map((s) => s.value!));
      }}
      placeholder="Select dimensions..."
    />
  );
};
