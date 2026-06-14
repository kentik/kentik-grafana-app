import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Stack, Field, Combobox, ComboboxOption, Input, FieldValidationMessage, Button } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { DataSource } from '../DataSource';
import { UDEQueryTarget, DEFAULT_UDE_QUERY } from '../ude_types';
import { VizType } from '../ude_query_builder';
import { MeasurementDetail, DimensionField, MetricField, OperatorSet, MeasurementFamily } from '../dictionary_service';
import { MeasurementSelector } from './MeasurementSelector';
import { DimensionsPicker } from './DimensionsPicker';
import { MetricsPicker } from './MetricsPicker';
import { FilterBuilder } from './FilterBuilder';

interface Props {
  query: UDEQueryTarget;
  onChange: (query: UDEQueryTarget) => void;
  onRunQuery: () => void;
  datasource: DataSource;
}

const VIZ_TYPE_OPTIONS: ComboboxOption[] = [
  { label: 'Line', value: String(VizType.LINE) },
  { label: 'Stacked Area', value: String(VizType.STACKED_AREA) },
  { label: 'Stacked Area 100%', value: String(VizType.STACKED_AREA_HUNDRED_PERCENT) },
  { label: 'Stacked Bar', value: String(VizType.STACKED_BAR) },
  { label: 'Bar', value: String(VizType.BAR) },
  { label: 'Pie', value: String(VizType.PIE) },
  { label: 'Table', value: String(VizType.TABLE) },
  { label: 'Gauge', value: String(VizType.GAUGE) },
  { label: 'Geo Heat Map', value: String(VizType.GEO_HEAT_MAP) },
];

const MERGE_FN_OPTIONS: ComboboxOption[] = [
  { label: 'Average', value: 'avg' },
  { label: 'Sum', value: 'sum' },
  { label: 'Minimum', value: 'min' },
  { label: 'Maximum', value: 'max' },
  { label: 'Last', value: 'last' },
];

const GUIDED_DIMENSION_CANDIDATES: Record<number, string[]> = {
  [MeasurementFamily.TRAFFIC]: [
    'i_device_name',
    'i_device_id',
    'i_device_site_name',
    'input_port',
    'src_geo',
    'dst_geo',
  ],
  [MeasurementFamily.NMS]: ['device_name', 'device_id', 'i_device_site_name', 'device_ip'],
  [MeasurementFamily.NMS_INTERFACES]: ['device_name', 'name', 'i_device_site_name'],
  [MeasurementFamily.SYNTHETICS]: ['target', 'ktlabel_syn_test', 'ktlabel_syn_agent'],
  [MeasurementFamily.BGP]: ['peer_asn', 'peer_ip', 'device_name'],
  [MeasurementFamily.EVENTS]: ['i_device_name', 'severity', 'facility'],
};

function normalizeFnName(raw?: string): string {
  const v = String(raw || '').toLowerCase();
  if (v.includes('avg')) {
    return 'avg';
  }
  if (v.includes('sum')) {
    return 'sum';
  }
  if (v.includes('min')) {
    return 'min';
  }
  if (v.includes('max')) {
    return 'max';
  }
  if (v.includes('last')) {
    return 'last';
  }
  return 'avg';
}

function areMetricsCompatible(anchor: MetricField, candidate: MetricField): boolean {
  const familyOk = !anchor.family_key || !candidate.family_key || anchor.family_key === candidate.family_key;
  const unitOk = !anchor.base_unit || !candidate.base_unit || anchor.base_unit === candidate.base_unit;
  return familyOk && unitOk;
}

export const UDEQueryEditor: React.FC<Props> = ({ query, onChange, onRunQuery, datasource }) => {
  const [measurements, setMeasurements] = useState<MeasurementDetail[]>([]);
  const [dimensions, setDimensions] = useState<DimensionField[]>([]);
  const [metrics, setMetrics] = useState<MetricField[]>([]);
  const [operatorSets, setOperatorSets] = useState<OperatorSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [localAliasBy, setLocalAliasBy] = useState(query.aliasBy || '');
  const [localPrefix, setLocalPrefix] = useState(query.prefix || '');
  const [showAliasSuggestions, setShowAliasSuggestions] = useState(false);
  const [aliasSuggestionFilter, setAliasSuggestionFilter] = useState('');
  const [activeSuggestionField, setActiveSuggestionField] = useState<'aliasBy' | 'prefix' | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Merge defaults once per query change so hooks can depend on a stable object.
  const current = useMemo(() => ({ ...DEFAULT_UDE_QUERY, ...query } as UDEQueryTarget), [query]);

  const metricByKey = useMemo(() => {
    const m = new Map<string, MetricField>();
    for (const metric of metrics) {
      m.set(metric.key, metric);
    }
    return m;
  }, [metrics]);

  const selectedMetricDefs = useMemo(
    () => (current.metrics || []).map((k) => metricByKey.get(k)).filter(Boolean) as MetricField[],
    [current.metrics, metricByKey]
  );

  const selectedMergeFn = useMemo(() => {
    const rollupFn = current.rollups?.[0]?.fn;
    if (rollupFn) {
      return normalizeFnName(rollupFn);
    }
    return normalizeFnName(selectedMetricDefs[0]?.aggregate_fn || selectedMetricDefs[0]?.window_fn || 'avg');
  }, [current.rollups, selectedMetricDefs]);

  const metricCompatibilityError = useMemo(() => {
    if (selectedMetricDefs.length <= 1) {
      return '';
    }
    const anchor = selectedMetricDefs[0];
    const incompatible = selectedMetricDefs.find((m) => !areMetricsCompatible(anchor, m));
    return incompatible
      ? 'Selected units are incompatible. Choose metrics from the same family/base unit.'
      : '';
  }, [selectedMetricDefs]);

  const queryValidationError = useMemo(() => {
    if (!current.measurement) {
      return 'Select a measurement.';
    }
    if (!current.metrics || current.metrics.length === 0) {
      return 'Select at least one unit (metric).';
    }
    if (metricCompatibilityError) {
      return metricCompatibilityError;
    }
    return '';
  }, [current.measurement, current.metrics, metricCompatibilityError]);

  const selectableMetrics = useMemo(() => {
    if (!selectedMetricDefs.length) {
      return metrics;
    }
    const anchor = selectedMetricDefs[0];
    return metrics.filter((m) => areMetricsCompatible(anchor, m) || (current.metrics || []).includes(m.key));
  }, [metrics, selectedMetricDefs, current.metrics]);

  const selectedMeasurement = useMemo(
    () => measurements.find((m) => m.name === current.measurement),
    [measurements, current.measurement]
  );

  const recommendedDimensions = useMemo(() => {
    if (!selectedMeasurement) {
      return [] as string[];
    }
    const candidates = GUIDED_DIMENSION_CANDIDATES[selectedMeasurement.family] || [];
    const available = new Set((dimensions || []).map((d) => d.key));
    return candidates.filter((k) => available.has(k)).slice(0, 1);
  }, [selectedMeasurement, dimensions]);

  const aliasTagOptions = useMemo(() => {
    const templateSrv = getTemplateSrv();
    const vars = templateSrv.getVariables().map((v: any) => `$${v.name}`);
    const builtIns: ComboboxOption[] = [
      { label: 'Aggregate function ($col)', value: '$col', group: 'Built-in' },
      { label: 'Metric group ($metric_group)', value: '$metric_group', group: 'Built-in' },
      { label: 'Metric group ($metric)', value: '$metric', group: 'Built-in' },
    ];
    const selectedDimensionOptions = (current.dimensions || []).map((dim) => ({
      label: `${dim} ($tag_${dim})`,
      value: `$tag_${dim}`,
      group: 'Selected Dimensions',
    }));
    const selectedHandlebarDimensionOptions = (current.dimensions || []).map((dim) => ({
      label: `${dim} ({{${dim}}})`,
      value: `{{${dim}}}`,
      group: 'Selected Dimensions',
    }));
    const variableOptions = vars.flatMap((v) => [
      { label: v, value: v, group: 'Dashboard Variables' },
      { label: `{{${v}}}`, value: `{{${v}}}`, group: 'Dashboard Variables' },
    ]);
    return [...builtIns, ...selectedDimensionOptions, ...selectedHandlebarDimensionOptions, ...variableOptions];
  }, [current.dimensions]);

  useEffect(() => {
    setLocalAliasBy(current.aliasBy || '');
  }, [current.aliasBy]);

  useEffect(() => {
    setLocalPrefix(current.prefix || '');
  }, [current.prefix]);

  // Load measurements on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const dictService = datasource.getDictionaryService();
    if (!dictService) {
      setIsLoading(false);
      return;
    }

    Promise.all([dictService.getMeasurements(), dictService.getOperatorSets()])
      .then(([meas, ops]) => {
        if (!cancelled) {
          setMeasurements(meas);
          setOperatorSets(ops);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasource]);

  // Load dimensions/metrics when measurement changes
  useEffect(() => {
    if (!current.measurement) {
      setDimensions([]);
      setMetrics([]);
      return;
    }

    let cancelled = false;
    const dictService = datasource.getDictionaryService();
    if (!dictService) {
      return;
    }

    Promise.all([
      dictService.getDimensions(current.measurement),
      dictService.getMetrics(current.measurement),
    ]).then(([dims, mets]) => {
      if (!cancelled) {
        setDimensions(dims);
        setMetrics(mets);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [datasource, current.measurement]);

  const update = useCallback(
    (patch: Partial<UDEQueryTarget>) => {
      onChange({ ...current, ...patch });
      const next = { ...current, ...patch } as UDEQueryTarget;
      if (next.measurement && (next.metrics || []).length > 0) {
        onRunQuery();
      }
    },
    [current, onChange, onRunQuery]
  );

  const onAliasTextBlur = useCallback(
    (field: 'aliasBy' | 'prefix') => {
      if (field === 'aliasBy' && localAliasBy !== (current.aliasBy || '')) {
        update({ aliasBy: localAliasBy });
      }
      if (field === 'prefix' && localPrefix !== (current.prefix || '')) {
        update({ prefix: localPrefix });
      }
      setTimeout(() => {
        setShowAliasSuggestions(false);
        setActiveSuggestionField(null);
      }, 120);
    },
    [localAliasBy, localPrefix, current.aliasBy, current.prefix, update]
  );

  const findCurrentToken = useCallback((value: string, cursorPos: number): { token: string; start: number } | null => {
    let start = cursorPos - 1;
    while (start >= 0 && value[start] !== '$' && value[start] !== '{' && value[start] !== ' ' && value[start] !== '}') {
      start--;
    }
    if (start >= 0 && (value[start] === '$' || value[start] === '{')) {
      while (start > 0 && value[start - 1] === '{') {
        start--;
      }
      return { token: value.slice(start, cursorPos), start };
    }
    return null;
  }, []);

  const onAliasTextChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>, field: 'aliasBy' | 'prefix') => {
      const newValue = e.currentTarget.value;
      const cursorPos = e.currentTarget.selectionStart || newValue.length;
      if (field === 'aliasBy') {
        setLocalAliasBy(newValue);
      } else {
        setLocalPrefix(newValue);
      }
      const tokenInfo = findCurrentToken(newValue, cursorPos);
      if (tokenInfo) {
        setShowAliasSuggestions(true);
        setAliasSuggestionFilter(tokenInfo.token.toLowerCase());
        setActiveSuggestionField(field);
        setActiveSuggestionIndex(0);
      } else {
        setShowAliasSuggestions(false);
        setAliasSuggestionFilter('');
        setActiveSuggestionField(null);
      }
    },
    [findCurrentToken]
  );

  const filteredAliasSuggestions = useMemo(() => {
    const raw = aliasSuggestionFilter.toLowerCase();
    const stripped = raw.replace(/^[\${]+/, '');
    return aliasTagOptions.filter((opt) => {
      const v = String(opt.value || '').toLowerCase();
      const l = String(opt.label || '').toLowerCase();
      const d = String((opt as any).description || '').toLowerCase();
      if (v.includes(raw) || l.includes(raw) || d.includes(raw)) {
        return true;
      }
      if (!stripped) {
        return true;
      }
      return v.includes(stripped) || l.includes(stripped) || d.includes(stripped);
    });
  }, [aliasTagOptions, aliasSuggestionFilter]);

  const onSelectAliasSuggestion = useCallback(
    (option: ComboboxOption) => {
      if (!option.value || !activeSuggestionField) {
        return;
      }
      const currentValue = activeSuggestionField === 'aliasBy' ? localAliasBy : localPrefix;
      const cursorPos = currentValue.length;
      const tokenInfo = findCurrentToken(currentValue, cursorPos);
      let newValue = currentValue;
      if (tokenInfo) {
        newValue = currentValue.slice(0, tokenInfo.start) + String(option.value) + currentValue.slice(cursorPos);
      } else {
        newValue = currentValue + String(option.value);
      }
      if (activeSuggestionField === 'aliasBy') {
        setLocalAliasBy(newValue);
      } else {
        setLocalPrefix(newValue);
      }
      setShowAliasSuggestions(false);
      setAliasSuggestionFilter('');
      setActiveSuggestionField(null);
    },
    [activeSuggestionField, localAliasBy, localPrefix, findCurrentToken]
  );

  const onAliasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showAliasSuggestions) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAliasSuggestions(false);
        setActiveSuggestionField(null);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex((idx) => Math.min(idx + 1, filteredAliasSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filteredAliasSuggestions.length > 0) {
        e.preventDefault();
        onSelectAliasSuggestion(filteredAliasSuggestions[activeSuggestionIndex]);
      }
    },
    [showAliasSuggestions, filteredAliasSuggestions, activeSuggestionIndex, onSelectAliasSuggestion]
  );

  const applyMergeFn = useCallback(
    (fn: string, metricKeys: string[] = current.metrics || []) => {
      if (!metricKeys.length) {
        return { rollups: [] as Array<{ metric: string; fn: string }> };
      }
      return {
        rollups: metricKeys.map((metric) => ({ metric, fn })),
      };
    },
    [current.metrics]
  );

  const onMeasurementChange = useCallback(
    (measurement: string) => {
      // Reset dependent query state when measurement changes.
      update({
        measurement,
        dimensions: [],
        metrics: [],
        filterGroups: [],
        rollups: [],
        sortBy: undefined,
        sortOrder: undefined,
      });
    },
    [update]
  );

  useEffect(() => {
    if (!current.metrics?.length || !current.sortBy) {
      return;
    }
    if (!current.metrics.includes(current.sortBy)) {
      update({ sortBy: undefined, sortOrder: undefined });
    }
  }, [current.metrics, current.sortBy, current.sortOrder, update]);

  return (
    <Stack direction="column" gap={1}>
      <Stack direction="row" gap={2} wrap="wrap">
        <Field label="Measurement">
          <MeasurementSelector
            measurements={measurements}
            value={current.measurement}
            onChange={onMeasurementChange}
            isLoading={isLoading}
          />
        </Field>
      </Stack>

      {current.measurement && (
        <>
          <Field label="Units (Metrics)">
            <MetricsPicker
              metrics={selectableMetrics}
              value={current.metrics}
              onChange={(mets) => {
                const patch = applyMergeFn(selectedMergeFn, mets);
                update({ metrics: mets, ...patch });
              }}
            />
          </Field>

          <Field label="Dimensions">
            <DimensionsPicker
              dimensions={dimensions}
              value={current.dimensions}
              onChange={(dims) => update({ dimensions: dims })}
            />
          </Field>

          {current.dimensions.length === 0 && recommendedDimensions.length > 0 && (
            <Field label="Recommended Dimension">
              <Stack direction="row" gap={1} alignItems="center">
                <span>{recommendedDimensions[0]}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update({ dimensions: recommendedDimensions })}
                  aria-label="Apply recommended dimension"
                >
                  Apply
                </Button>
              </Stack>
            </Field>
          )}

          <Field label="Merge Series Function">
            <Combobox
              options={MERGE_FN_OPTIONS}
              value={selectedMergeFn}
              onChange={(opt) => {
                const fn = String(opt?.value || 'avg');
                update(applyMergeFn(fn));
              }}
              width={20}
            />
          </Field>

          {queryValidationError && <FieldValidationMessage>{queryValidationError}</FieldValidationMessage>}

          <Field label="Filters">
            <FilterBuilder
              filterGroups={current.filterGroups}
              filterConnector={current.filterConnector}
              operatorSets={operatorSets}
              dimensionKeys={dimensions.map((d) => d.key)}
              onChange={(groups, connector) => update({ filterGroups: groups, filterConnector: connector })}
            />
          </Field>

          <Stack direction="row" gap={2} wrap="wrap">
            <Field label="Response Format">
              <Combobox
                options={VIZ_TYPE_OPTIONS}
                value={String(current.vizType)}
                onChange={(opt) => opt?.value && update({ vizType: Number(opt.value) as VizType })}
                width={20}
              />
            </Field>

            <Field label="Limit (Top N)">
              <Input
                type="number"
                value={current.limit}
                min={1}
                max={100}
                width={10}
                onChange={(e) => {
                  const val = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(val) && val > 0) {
                    update({ limit: val });
                  }
                }}
              />
            </Field>

            <Field label="Alias By">
              <div style={{ position: 'relative' }}>
                <Input
                  value={localAliasBy}
                  width={24}
                  placeholder="Type $ or { for suggestions"
                  onChange={(e) => onAliasTextChange(e, 'aliasBy')}
                  onBlur={() => onAliasTextBlur('aliasBy')}
                  onKeyDown={onAliasKeyDown}
                />
                <AliasSuggestionDropdown
                  field="aliasBy"
                  activeSuggestionField={activeSuggestionField}
                  showAliasSuggestions={showAliasSuggestions}
                  suggestions={filteredAliasSuggestions}
                  activeSuggestionIndex={activeSuggestionIndex}
                  onSelect={onSelectAliasSuggestion}
                />
              </div>
            </Field>

            <Field label="Prefix">
              <div style={{ position: 'relative' }}>
                <Input
                  value={localPrefix}
                  width={20}
                  placeholder="Type $ or { for suggestions"
                  onChange={(e) => onAliasTextChange(e, 'prefix')}
                  onBlur={() => onAliasTextBlur('prefix')}
                  onKeyDown={onAliasKeyDown}
                />
                <AliasSuggestionDropdown
                  field="prefix"
                  activeSuggestionField={activeSuggestionField}
                  showAliasSuggestions={showAliasSuggestions}
                  suggestions={filteredAliasSuggestions}
                  activeSuggestionIndex={activeSuggestionIndex}
                  onSelect={onSelectAliasSuggestion}
                />
              </div>
            </Field>
          </Stack>
        </>
      )}
    </Stack>
  );
};

type AliasSuggestionDropdownProps = {
  field: 'aliasBy' | 'prefix';
  activeSuggestionField: 'aliasBy' | 'prefix' | null;
  showAliasSuggestions: boolean;
  suggestions: ComboboxOption[];
  activeSuggestionIndex: number;
  onSelect: (opt: ComboboxOption) => void;
};

const AliasSuggestionDropdown: React.FC<AliasSuggestionDropdownProps> = ({
  field,
  activeSuggestionField,
  showAliasSuggestions,
  suggestions,
  activeSuggestionIndex,
  onSelect,
}) => {
  if (!showAliasSuggestions || activeSuggestionField !== field) {
    return null;
  }
  return (
    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1100, border: '1px solid #3b3f44', background: '#111217', minWidth: 260, maxHeight: 260, overflowY: 'auto' }}>
      {suggestions.length === 0 && <div style={{ padding: 8 }}>No suggestions</div>}
      {suggestions.map((opt, idx) => (
        <div
          key={`${String(opt.group || '')}-${String(opt.value || idx)}`}
          style={{ padding: '6px 10px', cursor: 'pointer', background: idx === activeSuggestionIndex ? '#2d3340' : 'transparent' }}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(opt);
          }}
        >
          <div>{opt.label || opt.value}</div>
          {opt.group && <div style={{ fontSize: 11, opacity: 0.7 }}>{opt.group}</div>}
        </div>
      ))}
    </div>
  );
};
