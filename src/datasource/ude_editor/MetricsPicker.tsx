import React, { useMemo } from 'react';
import { MultiCombobox, ComboboxOption } from '@grafana/ui';
import { MetricField } from '../dictionary_service';

interface Props {
  metrics: MetricField[];
  value: string[];
  onChange: (metrics: string[]) => void;
}

export const MetricsPicker: React.FC<Props> = ({ metrics, value, onChange }) => {
  const options = useMemo(() => {
    const grouped = new Map<string, MetricField[]>();
    for (const m of metrics) {
      const category = m.category || 'Other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(m);
    }

    const result: ComboboxOption[] = [];
    const sortedCategories = Array.from(grouped.keys()).sort();
    for (const category of sortedCategories) {
      const items = grouped.get(category)!;
      for (const item of items.sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key))) {
        result.push({
          label: item.label || item.key,
          value: item.key,
          description: category,
        });
      }
    }
    return result;
  }, [metrics]);

  return (
    <MultiCombobox
      options={options}
      value={value}
      onChange={(selected) => {
        onChange(selected.map((s) => s.value!));
      }}
      placeholder="Select metrics..."
    />
  );
};
