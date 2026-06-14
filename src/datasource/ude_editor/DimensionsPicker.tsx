import React, { useMemo } from 'react';
import { MultiCombobox, ComboboxOption } from '@grafana/ui';
import { DimensionField } from '../dictionary_service';

interface Props {
  dimensions: DimensionField[];
  value: string[];
  onChange: (dimensions: string[]) => void;
}

export const DimensionsPicker: React.FC<Props> = ({ dimensions, value, onChange }) => {
  const options = useMemo(() => {
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
  }, [dimensions]);

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
