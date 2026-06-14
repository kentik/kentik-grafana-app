import React from 'react';
import { Stack, Input, Button, Combobox, ComboboxOption } from '@grafana/ui';
import { QueryFilterGroup, QueryFilter } from '../ude_query_builder';
import { OperatorSet } from '../dictionary_service';

interface Props {
  filterGroups: QueryFilterGroup[];
  filterConnector: string;
  operatorSets: OperatorSet[];
  dimensionKeys: string[];
  onChange: (filterGroups: QueryFilterGroup[], connector: string) => void;
}

const CONNECTOR_OPTIONS: ComboboxOption[] = [
  { label: 'All (AND)', value: 'All' },
  { label: 'Any (OR)', value: 'Any' },
];

export const FilterBuilder: React.FC<Props> = ({
  filterGroups,
  filterConnector,
  operatorSets,
  dimensionKeys,
  onChange,
}) => {
  const dimensionOptions: ComboboxOption[] = dimensionKeys.map((k) => ({ label: k, value: k }));

  // Flatten all operators from all sets for simplicity
  const allOperators: ComboboxOption[] = React.useMemo(() => {
    const seen = new Set<string>();
    const result: ComboboxOption[] = [];
    for (const set of operatorSets) {
      for (const op of set.operators) {
        if (!seen.has(op.key)) {
          seen.add(op.key);
          result.push({ label: op.label || op.key, value: op.key });
        }
      }
    }
    if (result.length === 0) {
      // Fallback basic operators
      return [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: 'contains', value: 'contains' },
        { label: 'not contains', value: 'not_contains' },
        { label: 'starts with', value: 'starts_with' },
        { label: 'in', value: 'in' },
        { label: 'not in', value: 'not_in' },
      ];
    }
    return result;
  }, [operatorSets]);

  const addFilterGroup = () => {
    const newGroup: QueryFilterGroup = {
      connector: 'All',
      not: false,
      filters: [{ filter_field: '', operator: '=', filter_value: '' }],
    };
    onChange([...filterGroups, newGroup], filterConnector);
  };

  const removeFilterGroup = (index: number) => {
    const updated = filterGroups.filter((_, i) => i !== index);
    onChange(updated, filterConnector);
  };

  const updateFilter = (groupIdx: number, filterIdx: number, patch: Partial<QueryFilter>) => {
    const updated = filterGroups.map((group, gi) => {
      if (gi !== groupIdx) {
        return group;
      }
      const filters = group.filters.map((f, fi) => (fi === filterIdx ? { ...f, ...patch } : f));
      return { ...group, filters };
    });
    onChange(updated, filterConnector);
  };

  const addFilter = (groupIdx: number) => {
    const updated = filterGroups.map((group, gi) => {
      if (gi !== groupIdx) {
        return group;
      }
      return { ...group, filters: [...group.filters, { filter_field: '', operator: '=', filter_value: '' }] };
    });
    onChange(updated, filterConnector);
  };

  const removeFilter = (groupIdx: number, filterIdx: number) => {
    const updated = filterGroups.map((group, gi) => {
      if (gi !== groupIdx) {
        return group;
      }
      return { ...group, filters: group.filters.filter((_, fi) => fi !== filterIdx) };
    });
    onChange(updated, filterConnector);
  };

  return (
    <div>
      <Stack direction="row" gap={1} alignItems="center">
        <span>Match</span>
        <Combobox
          options={CONNECTOR_OPTIONS}
          value={filterConnector}
          onChange={(opt) => opt?.value && onChange(filterGroups, opt.value)}
          width={20}
        />
        <span>of the following groups:</span>
        <Button variant="secondary" size="sm" icon="plus" onClick={addFilterGroup}>
          Add Group
        </Button>
      </Stack>

      {filterGroups.map((group, gi) => (
        <div key={gi} style={{ marginTop: 8, padding: 8, border: '1px solid var(--border-weak)', borderRadius: 4 }}>
          <Stack direction="row" gap={1} alignItems="center">
            <span>Group {gi + 1}</span>
            <Button variant="destructive" size="sm" icon="trash-alt" aria-label="Remove filter group" onClick={() => removeFilterGroup(gi)} />
            <Button variant="secondary" size="sm" icon="plus" onClick={() => addFilter(gi)}>
              Add Filter
            </Button>
          </Stack>
          {group.filters.map((filter, fi) => (
            <Stack key={fi} direction="row" gap={1} alignItems="center" wrap="wrap">
              <Combobox
                options={dimensionOptions}
                value={filter.filter_field || null}
                onChange={(opt) => opt?.value && updateFilter(gi, fi, { filter_field: opt.value })}
                placeholder="Field"
                width={25}
              />
              <Combobox
                options={allOperators}
                value={filter.operator || null}
                onChange={(opt) => opt?.value && updateFilter(gi, fi, { operator: opt.value })}
                placeholder="Op"
                width={15}
              />
              <Input
                value={filter.filter_value}
                onChange={(e) => updateFilter(gi, fi, { filter_value: e.currentTarget.value })}
                placeholder="Value"
                width={25}
              />
              <Button variant="destructive" size="sm" icon="trash-alt" aria-label="Remove filter" onClick={() => removeFilter(gi, fi)} />
            </Stack>
          ))}
        </div>
      ))}
    </div>
  );
};
