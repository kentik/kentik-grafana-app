import { ALL_SITES_LABEL, DataSource } from './DataSource';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Stack, Input, Button, Field, Label, Combobox, ComboboxOption, MultiSelect, FieldValidationMessage } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import React, { useEffect, useState, useRef } from 'react';
import _ from 'lodash';
import { dimensionList, METRIC_TYPE } from './metric_def';

function getMetricType(metrics: SelectableValue[], selectedMetric: SelectableValue): METRIC_TYPE | undefined {
  if (selectedMetric === undefined) {
    return undefined;
  }

  const metricType = metrics.find((metric) => {
    return metric.label === selectedMetric.group
  });

  return metricType?.type;
}

function excludeContraryMetricTypes(metrics: SelectableValue[], currentMetrics: SelectableValue[]) {
  if (currentMetrics === undefined || currentMetrics === null || currentMetrics.length === 0) {
    return metrics;
  }

  const metricType = getMetricType(metrics, currentMetrics[0]);

  if (metricType === undefined) {
    return metrics;
  }

  return metrics.filter((metric) => {
    return metric.type === metricType;
  })
}

export interface Query extends DataQuery {
  mode: DataMode;
  sites: SelectableValue[];
  devices: SelectableValue[];
  dimension: SelectableValue[];
  metric: SelectableValue[];
  hostnameLookup: string;
  prefix: string;
  customFilters: CustomFilter[];
  // TODO: enum
  conjunctionOperator: ConjunctionOperator;
  aliasBy: string;
  topx: string;
}

type Options = {};
type QueryEditorComponentProps = QueryEditorProps<DataSource, Query, Options>;

interface AliasByComboboxOption<T extends string | number = string> extends ComboboxOption {
  originalValue?: T;
}

export type CustomFilter = {
  conjunctionOperator: string;
  operatorSegment: string;
  keySegment: string | null;
  valueSegment: string | null;
};

export enum DataMode {
  GRAPH = 'graph',
  TABLE = 'table',
}

export enum ConjunctionOperator {
  AND = 'AND',
  OR = 'OR',
}

const DEFAULT_TOPX = '8';

export const DEFAULT_QUERY = {
  mode: DataMode.GRAPH,
  sites: null,
  devices: null,
  dimension: null,
  metric: null,
  hostnameLookup: null,
  prefix: '',
  customFilters: [],
  conjunctionOperator: ConjunctionOperator.AND,
  aliasBy: '',
  topx: DEFAULT_TOPX, // Default value of returned top results
};

export type QueryItem = {
  value: string;
  text: string;
};

const CONJUNCTION_OPERATORS: QueryItem[] = [
  { value: 'AND', text: 'AND' },
  { value: 'OR', text: 'OR' },
];

const QUERY_MODES: QueryItem[] = [
  { value: DataMode.GRAPH, text: 'Graph' },
  { value: DataMode.TABLE, text: 'Table' },
];

const HOSTNAME_LOOKUP_CHOICES = [
  { value: 'enabled', text: 'Enabled' },
  { value: 'disabled', text: 'Disabled' },
];

const FIELDS_VALIDATION_MESSAGES = {
  EMPTY: 'Field cannot be empty',
}

const MAX_DIMENSIONS = 8;

const OBLIGATORY_FIELDS_NAMES = ['sites', 'devices', 'dimension', 'metric'];

export const QueryEditor: React.FC<QueryEditorComponentProps> = (props) => {
  _.defaults(props.query, DEFAULT_QUERY);

  const prefixInputRef = useRef<HTMLInputElement>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const convertToComboboxOptions = (items: QueryItem[]): Array<ComboboxOption<string>> => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  };

  const getOperators = (): Array<ComboboxOption<string>> => {
    const operators = ['=', '!=', '<', '<=', '>', '>='];
    const operatorItems = operators.map((o: string) => ({ value: o, text: o }));
    return convertToComboboxOptions(operatorItems);
  };

  const [state, setState] = useState({
    sites: [] as Array<SelectableValue<string>>,
    devices: [] as Array<SelectableValue<string>>,
    dimensions: [] as Array<SelectableValue<string>>,
    metrics: [] as Array<SelectableValue<string>>,
    tagKeys: [] as Array<ComboboxOption<string>>,
    tagValues: [] as Array<Array<ComboboxOption<string>>>,
    operators: getOperators(),
    isLoading: true,
    isDevicesLoading: true,
    customDimensions: [] as Array<AliasByComboboxOption<string>>,
    aliasTagOptions: [] as Array<ComboboxOption<string>>,
    // Alias autocomplete state
    showAliasSuggestions: false,
    aliasSuggestionFilter: '',
    aliasCursorPosition: 0,
    activeSuggestionField: null as 'aliasBy' | 'prefix' | null,
    activeSuggestionIndex: 0,
  });
  const [errorState, setErrorState] = useState<Record<string, string>>({
    sites: '',
    devices: '',
    dimension: '',
    metric: ''
  })

  useEffect(() => {
    const init = async () => {
      try {
        const [sites, devices, dimensions, metrics, tagKeys, customDimensions] = await Promise.all([
          fetchSites(),
          fetchDevices(),
          fetchDimensions(),
          fetchMetrics(),
          fetchTagKeys(),
          fetchCustomDimensions()
        ]);

        setState({
          ...state,
          sites,
          devices,
          dimensions,
          metrics,
          tagKeys,
          isLoading: false,
          isDevicesLoading: false,
          customDimensions
        });
      } catch (error) {
        console.error('Failed to initialize Query Editor:', error);
        setState(s => ({ ...s, isLoading: false, isDevicesLoading: false }));
      }
    };
    init();
    // eslint-disable-next-line
  }, []);

  // Helper to ensure multi-select fields are always arrays of SelectableValues
  const ensureArray = (value: any): SelectableValue[] => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map(v => ({ value: v, label: v }));
    }
    return [];
  };

  // Update alias tag options when dimensions change - only show selected dimensions
  useEffect(() => {
    const selectedDimensions = ensureArray(props.query.dimension);
    const selectedDimensionValues = selectedDimensions.map((d: SelectableValue<string>) => d.value);

    // Filter standard dimensions to only those selected
    const standardDimensionOptions: Array<ComboboxOption<string>> = dimensionList
      .filter((dim) => selectedDimensionValues.includes(dim.value))
      .map((dim) => ({
        label: `${dim.text} ($tag_${dim.field})`,
        value: `$tag_${dim.field}`,
      }));

    // Filter custom dimensions to only those selected
    const customDimensionOptions: Array<ComboboxOption<string>> = (state.customDimensions || [])
      .filter((dim: AliasByComboboxOption<string>) => selectedDimensionValues.includes(dim.originalValue))
      .map((dim: AliasByComboboxOption<string>) => ({
        label: `${dim.label} ($tag_${dim.originalValue})`,
        value: `$tag_${dim.originalValue}`,
      }));

    // Add $col option for metric name
    const metricOption: ComboboxOption<string> = {
      label: 'Metric name ($col)',
      value: '$col',
    };

    const aliasTagOptions = [metricOption, ...standardDimensionOptions, ...customDimensionOptions];

    setState(prevState => ({
      ...prevState,
      aliasTagOptions
    }));
  }, [props.query.dimension, state.customDimensions]);

  const getEmptyFieldsNames = (query: any): string[] => {
    const emptyFields = OBLIGATORY_FIELDS_NAMES.filter((name) => {
      const currentField = query[name];

      if (currentField === undefined || currentField === null) {
        return true;
      }

      if (Array.isArray(currentField) && currentField.length === 0) {
        return true;
      }

      return false;
    })

    return emptyFields;
  }

  // todo
  const isQueryValid = (query: any): boolean => {
    const emptyFields = getEmptyFieldsNames(query);

    if (emptyFields.length === 0) {
      // clear messages
      setErrorState(oldState => {
        const keys = Object.keys(oldState);

        const newState = keys.reduce((acc, item) => {
          acc[item] = '';

          return acc;
        }, {} as Record<string, string>);

        return newState;
      })

      return true;
    }
    const message = FIELDS_VALIDATION_MESSAGES.EMPTY;

    const errorMessages: Record<string, string> = {};

    OBLIGATORY_FIELDS_NAMES.forEach((fieldName: string) => {
      if (emptyFields.includes(fieldName)) {
        errorMessages[fieldName] = message;
      } else if (errorState[fieldName] === message || errorState[fieldName] === '') {
        errorMessages[fieldName] = '';
      }
    });


    setErrorState((oldState) => ({ ...oldState, ...errorMessages }))

    return false;
  }

  const onRunQuery = (queryValid?: boolean): void => {
    if (queryValid === false) {
      return;
    }

    props.onRunQuery();
  }

  const onQueryChange = (query: any): void => {
    props.onChange(query)
  }

  const variableExists = (variableName: string): boolean => {
    const templateSrv = getTemplateSrv();
    const variables = templateSrv.getVariables().map((variable) => `$${variable.name}`);
    return _.includes(variables, variableName);
  };

  const getOptions = async (
    query: string,
    variableName?: string,
    target?: any
  ): Promise<Array<ComboboxOption<string>>> => {
    let metrics: QueryItem[] = await props.datasource.metricFindQuery(query, target || props.query);
    return convertToComboboxOptions(appendVariableIfExists(metrics, variableName));
  };

  const appendVariableIfExists = (options: QueryItem[], variableName?: string) => {
    if (variableName && variableExists(variableName)) {
      return [{ text: variableName, value: variableName }, ...options];
    }
    return options;
  };

  const fetchSites = async (): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('sites()');
  };

  const fetchDevices = async (target?: any): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('devices()', '$device', target);
  };

  const fetchDimensions = async (): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('dimensions()', '$dimension');
  };

  const fetchMetrics = async (): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('metrics()', '$metric');
  };

  const fetchCustomDimensions = async () => {
    const customDimensionsOptions = await props.datasource.getCustomDimensions();

    return customDimensionsOptions;
  }

  const getFormattedVariables = (): QueryItem[] => {
    const templateSrv = getTemplateSrv();
    const variables = _.map(templateSrv.getVariables(), (variable) => `$${variable.name}`);
    return _.map(variables, (variableName: string) => ({ value: variableName, text: variableName }));
  };

  const fetchTagKeys = async (): Promise<Array<ComboboxOption<string>>> => {
    const keys: Array<{ text: string; field: string }> = await props.datasource.getTagKeys();
    const items: QueryItem[] = keys.map((key) => ({ value: key.text, text: key.text }));

    const formattedVariables = getFormattedVariables();
    return convertToComboboxOptions(_.concat(formattedVariables, items));
  };

  const onOptionSelect = async (field: keyof Query, option: ComboboxOption<string>) => {
    if (option.value === undefined) {
      return;
    }
    const query: Query = _.cloneDeep(props.query);
    // @ts-ignore
    query[field] = option.value;

    onQueryChange(query);
    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  };

  const onOptionChange = (field: keyof Query, value: string) => {
    const query = _.cloneDeep(props.query);
    //@ts-ignore
    query[field] = value;

    onQueryChange(query);
    isQueryValid(query)
  };

  const onDeviceSelect = (value: SelectableValue[]) => {
    const query: Query = _.cloneDeep(props.query);
    // @ts-ignore
    query['devices'] = value;

    onQueryChange(query);
    isQueryValid(query)
  }

  const onMetricSelect = (value: SelectableValue[]) => {
    const query: Query = _.cloneDeep(props.query);
    // @ts-ignore
    query['metric'] = value;

    onQueryChange(query);
    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  }

  const onTopXBlur = () => {
    const query = _.cloneDeep(props.query);
    let queryValid = false;
    if (!query.topx || _.toNumber(query.topx) <= 0) {
      query.topx = DEFAULT_TOPX;
      onQueryChange(query);
      queryValid = isQueryValid(query);
    }
    onRunQuery(queryValid);
  };

  const onDimensionSelect = (value: SelectableValue[]) => {
    const query: Query = _.cloneDeep(props.query);
    // @ts-ignore
    query['dimension'] = value;

    onQueryChange(query);
    const dimensionLimitReached = query.dimension?.length >= MAX_DIMENSIONS;
    setState({
      ...state,
      dimensions: state.dimensions.map((dimension: SelectableValue) => ({ ...dimension, isDisabled: dimensionLimitReached })),
    });

    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  }

  // Find the current "$..." token being typed at cursor position
  const findCurrentToken = (value: string, cursorPos: number): { token: string; start: number } | null => {
    // Look backwards from cursor to find a $ that starts a token
    let start = cursorPos - 1;
    while (start >= 0 && value[start] !== '$' && value[start] !== ' ') {
      start--;
    }

    if (start >= 0 && value[start] === '$') {
      const token = value.slice(start, cursorPos);
      return { token, start };
    }
    return null;
  };

  const onAliasMouseUp = (e: React.MouseEvent<HTMLInputElement>, field: 'aliasBy' | 'prefix') => {
    const cursorPos = e.currentTarget.selectionStart || 0;
    const tokenInfo = findCurrentToken(props.query[field], cursorPos);
    const isCursorAfterTokenStart = tokenInfo && (tokenInfo.start === cursorPos - 1);

    if (isCursorAfterTokenStart) {
      setState(prev => ({
        ...prev,
        showAliasSuggestions: true,
        aliasSuggestionFilter: tokenInfo.token.toLowerCase(),
        aliasCursorPosition: cursorPos,
        activeSuggestionField: field,
        activeSuggestionIndex: 0,
      }));
    } else {
      setState(prev => ({
        ...prev,
        showAliasSuggestions: false,
        aliasSuggestionFilter: '',
        activeSuggestionField: null,
      }));
    }
  }

  const onAliasTextChange = (e: React.FormEvent<HTMLInputElement>, field: 'aliasBy' | 'prefix'): void => {
    const newValue = e.currentTarget.value;
    const cursorPos = e.currentTarget.selectionStart || newValue.length;

    onQueryChange({ ...props.query, [field]: newValue });

    // Check if user is typing a $ token
    const tokenInfo = findCurrentToken(newValue, cursorPos);

    if (tokenInfo) {
      // Show suggestions filtered by what they've typed so far
      setState(prev => ({
        ...prev,
        showAliasSuggestions: true,
        aliasSuggestionFilter: tokenInfo.token.toLowerCase(),
        aliasCursorPosition: cursorPos,
        activeSuggestionField: field,
        activeSuggestionIndex: 0,
      }));
    } else {
      // Hide suggestions
      setState(prev => ({
        ...prev,
        showAliasSuggestions: false,
        aliasSuggestionFilter: '',
        activeSuggestionField: null,
      }));
    }
  };

  const onAliasKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!state.showAliasSuggestions) {
      return;
    }

    const filteredSuggestions = state.aliasTagOptions.filter(opt =>
      opt.value?.toLowerCase().includes(state.aliasSuggestionFilter) ||
      opt.label?.toLowerCase().includes(state.aliasSuggestionFilter)
    );

    if (e.key === 'Escape') {
      setState(prev => ({ ...prev, showAliasSuggestions: false, activeSuggestionField: null }));
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setState(prev => ({
        ...prev,
        activeSuggestionIndex: Math.min(prev.activeSuggestionIndex + 1, filteredSuggestions.length - 1)
      }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setState(prev => ({
        ...prev,
        activeSuggestionIndex: Math.max(prev.activeSuggestionIndex - 1, 0)
      }));
    } else if (e.key === 'Enter') {
      if (filteredSuggestions.length > 0) {
        e.preventDefault();
        onSelectAliasSuggestion(filteredSuggestions[state.activeSuggestionIndex]);
      }
    } else if (e.key === 'Tab' && filteredSuggestions.length > 0) {
      // Auto-complete with first suggestion on Tab
      e.preventDefault();
      onSelectAliasSuggestion(filteredSuggestions[state.activeSuggestionIndex]);
    }
  };

  const onSelectAliasSuggestion = (option: ComboboxOption<string>): void => {
    if (!option.value || !state.activeSuggestionField) {
      return;
    }

    const field = state.activeSuggestionField;
    const input = field === 'prefix' ? prefixInputRef.current : aliasInputRef.current;
    const currentValue = props.query[field] || '';
    const cursorPos = input?.selectionStart || currentValue.length;

    // Find the token being completed
    const tokenInfo = findCurrentToken(currentValue, cursorPos);

    let newValue: string;
    if (tokenInfo) {
      // Replace the partial token with the full value
      newValue = currentValue.slice(0, tokenInfo.start) + option.value + currentValue.slice(cursorPos);
    } else {
      // Just append
      newValue = currentValue + option.value;
    }

    onQueryChange({ ...props.query, [field]: newValue });
    setState(prev => ({ ...prev, showAliasSuggestions: false, aliasSuggestionFilter: '', activeSuggestionField: null }));

    // Focus back on input
    setTimeout(() => {
      if (input) {
        input.focus();
        const newCursorPos = (tokenInfo?.start || currentValue.length) + option.value.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const onAliasTextBlur = (): void => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      setState(prev => ({ ...prev, showAliasSuggestions: false, activeSuggestionField: null }));
    }, 150);
    onRunQuery();
  };

  const onConjuctionOperatorSelect = (option: ComboboxOption<string>) => {
    if (_.isNil(option.value)) {
      return;
    }
    const customFilters = _.cloneDeep(props.query.customFilters);
    for (let filter of customFilters) {
      filter.conjunctionOperator = option.value;
    }

    onQueryChange({ ...props.query, conjunctionOperator: option.value as ConjunctionOperator, customFilters });
    const queryValid = isQueryValid(props.query);
    onRunQuery(queryValid);
  };

  const onFilterOptionSelect = async (
    field: keyof CustomFilter,
    option: ComboboxOption<string>,
    filterIdx: number
  ) => {
    if (_.isNil(option.value)) {
      return;
    }
    const customFilters = _.cloneDeep(props.query.customFilters);
    customFilters[filterIdx][field] = option.value;
    if (field === 'keySegment') {
      customFilters[filterIdx].valueSegment = null;
      const stateValues = [...state.tagValues];
      stateValues[filterIdx] = undefined as any;
      setState((prev) => ({
        ...prev,
        tagValues: stateValues,
      }));
    }

    onQueryChange({ ...props.query, customFilters });

    if (field !== 'keySegment') {
      const queryValid = isQueryValid(props.query);
      onRunQuery(queryValid);
    }
  };

  const onAddFilterButtonClick = () => {
    const defaultFilter: CustomFilter = {
      keySegment: null,
      operatorSegment: '=',
      valueSegment: null,
      conjunctionOperator: 'AND',
    };

    onQueryChange({ ...props.query, customFilters: [...props.query.customFilters, defaultFilter] });
  };

  const onDeleteFilterButtonClick = (filterIdx: number) => {
    onQueryChange({
      ...props.query,
      customFilters: props.query.customFilters.filter((filter: any, idx: number) => idx !== filterIdx),
    });
    const queryValid = isQueryValid(props.query);
    onRunQuery(queryValid);
  };

  const onSitesSelect = async (value: Array<SelectableValue<string>>) => {
    const query: Query = _.cloneDeep(props.query);
    query['sites'] = value;
    query.devices = [];

    onQueryChange(query);

    setState({
      ...state,
      isDevicesLoading: true,
      devices: [],
    });

    const devices = await fetchDevices(query);

    setState({
      ...state,
      isDevicesLoading: false,
      devices,
    });
    isQueryValid(query)
  };

  useEffect(() => {
    return () => {
      props.datasource.initialRun = true;
    };
  }, [props.datasource]);

  // computed values
  const filteredMetrics = excludeContraryMetricTypes(state.metrics, ensureArray(props.query.metric));

  return (
    <Stack direction="column">
      <Stack direction="row">
        <Field label="Data Mode">
          <Combobox
            options={convertToComboboxOptions(QUERY_MODES)}
            placeholder='Select...'
            value={props.query.mode}
            width={20}
            onChange={(selected: ComboboxOption<string>) => {
              onOptionSelect('mode', selected);
            }}
          />
        </Field>
      </Stack>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Field label={<><span>Sites <span style={{ color: 'red' }}>*</span></span></>}>
          <>
            <MultiSelect
              placeholder={state.isLoading ? 'Loading...' : ALL_SITES_LABEL}
              value={ensureArray(props.query.sites)}
              disabled={state.isLoading}
              options={state.isLoading ? [] : state.sites}
              width={40}
              hideSelectedOptions={false}
              onChange={(value) => onSitesSelect(value)}
            />
            {errorState.sites && <FieldValidationMessage>{errorState.sites}</FieldValidationMessage>}
          </>
        </Field>
        <Field label={<><span>Devices <span style={{ color: 'red' }}>*</span></span></>}>
          <>
            <MultiSelect
              placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
              disabled={state.isLoading}
              value={ensureArray(props.query.devices)}
              options={state.devices}
              width={40}
              hideSelectedOptions={false}
              onChange={(value) => onDeviceSelect(value)}
            />
            {errorState.devices && <FieldValidationMessage>{errorState.devices}</FieldValidationMessage>}
          </>
        </Field>
      </Stack>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Field label={<><span>Dimensions <span style={{ color: 'red' }}>*</span></span></>}>
          <>
            <MultiSelect
              placeholder={'Select...'}
              disabled={state.isLoading}
              value={ensureArray(props.query.dimension)}
              options={state.dimensions}
              width={40}
              hideSelectedOptions={false}
              onChange={(value) => onDimensionSelect(value)}
            />
            {ensureArray(props.query.dimension).length >= MAX_DIMENSIONS && <div style={{ width: '150px' }}>Max {MAX_DIMENSIONS} dimensions allowed.</div>}
            {errorState.dimension && <FieldValidationMessage>{errorState.dimension}</FieldValidationMessage>}
          </>
        </Field>
        <Field label={<><span>Metric <span style={{ color: 'red' }}>*</span></span></>}>
          <>
            <MultiSelect
              placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
              disabled={state.isLoading}
              value={ensureArray(props.query.metric)}
              components={{
                MultiValueLabel,
              }}
              options={filteredMetrics}
              width={40}
              hideSelectedOptions={false}
              onChange={(value) => onMetricSelect(value)}
            />
            {errorState.metric && <FieldValidationMessage>{errorState.metric}</FieldValidationMessage>}
          </>
        </Field>
      </Stack>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Field label="DNS Lookup">
          <Combobox
            value={props.query.hostnameLookup}
            options={convertToComboboxOptions(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={19.5}
            placeholder='Select...'
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />
        </Field>
        <Field label="Prefix">
          <div style={{ position: 'relative' }}>
            <Input
              ref={prefixInputRef}
              type="text"
              width={19.5}
              value={props.query.prefix}
              onChange={(e) => onAliasTextChange(e, 'prefix')}
              onKeyDown={onAliasKeyDown}
              onBlur={onAliasTextBlur}
              placeholder='Type...'
              onMouseUp={(e) => onAliasMouseUp(e, 'prefix')}
            />
            <DimensionsSuggestionComponent
              field={'prefix'}
              showAliasSuggestions={state.showAliasSuggestions}
              onSelectAliasSuggestion={onSelectAliasSuggestion}
              activeSuggestionField={state.activeSuggestionField}
              activeSuggestionIndex={state.activeSuggestionIndex}
              aliasTagOptions={state.aliasTagOptions}
              aliasSuggestionFilter={state.aliasSuggestionFilter} />
          </div>
        </Field>
        <Field label="Alias by">
          <div style={{ position: 'relative' }}>
            <Input
              ref={aliasInputRef}
              type="text"
              width={50}
              value={props.query.aliasBy || ''}
              onChange={(e) => onAliasTextChange(e, 'aliasBy')}
              onKeyDown={onAliasKeyDown}
              onBlur={onAliasTextBlur}
              onMouseUp={(e) => onAliasMouseUp(e, 'aliasBy')}
              placeholder='Type $ for suggestions, e.g., Traffic: $tag_src_ip'
            />
            <DimensionsSuggestionComponent
              field={'aliasBy'}
              showAliasSuggestions={state.showAliasSuggestions}
              onSelectAliasSuggestion={onSelectAliasSuggestion}
              activeSuggestionField={state.activeSuggestionField}
              activeSuggestionIndex={state.activeSuggestionIndex}
              aliasTagOptions={state.aliasTagOptions}
              aliasSuggestionFilter={state.aliasSuggestionFilter} />
          </div>
        </Field>
      </Stack>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Field label="Visualization depth">
          <Input
            type="number"
            width={12}
            value={props.query.topx}
            onChange={(e) => onOptionChange('topx', e.currentTarget.value)}
            onBlur={onTopXBlur}
            placeholder='Type...'
          />
        </Field>
        <Field label="Filters">
          <Button size="sm" icon="plus" variant="secondary" onClick={onAddFilterButtonClick} aria-label="filters-button"></Button>
        </Field>
        {props.query.customFilters.length > 1 && (
          <Field label="Conjunction">
            <Combobox
              value={props.query.conjunctionOperator}
              options={convertToComboboxOptions(CONJUNCTION_OPERATORS)}
              width={20}
              onChange={(option) => onConjuctionOperatorSelect(option)}
              placeholder='Select...'
            />
          </Field>
        )}
      </Stack>
      {props.query.customFilters.map((filter: CustomFilter, filterIdx: number) => (
        <Stack direction="column" gap={0.5} key={`custom-filter-stack-${filterIdx}`}>
          <div style={{ height: '8px' }} />
          <Stack direction="row" gap={2} alignItems="center" key={`custom-filter-row-${filterIdx}`}>
            <Combobox
              value={filter.keySegment}
              options={state.tagKeys}
              width={20}
              placeholder='Select...'
              onChange={(option) => onFilterOptionSelect('keySegment', option, filterIdx)}
            />
            {!_.isNil(filter.keySegment) && (
              <>
                <Combobox
                  value={filter.operatorSegment}
                  options={state.operators}
                  width={10}
                  placeholder='Select...'
                  onChange={(option) => onFilterOptionSelect('operatorSegment', option, filterIdx)}
                />

                <Input
                  width={30}
                  value={filter.valueSegment ?? ''}
                  onChange={(e) => onFilterOptionSelect('valueSegment', { value: e.currentTarget.value, label: e.currentTarget.value }, filterIdx)}
                  placeholder='Value'
                />
              </>
            )}
            <Button
              size="sm"
              icon="trash-alt"
              variant="secondary"
              onClick={() => onDeleteFilterButtonClick(filterIdx)}
              aria-label="trash-button"
            ></Button>
            {props.query.customFilters.length > 1 && (
              <Label style={{ marginBottom: 0 }}>{props.query.conjunctionOperator}</Label>
            )}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
};

import { components, MultiValueProps } from 'react-select';

const MultiValueLabel = (props: MultiValueProps<any>) => {
  const { label, group } = props.data;

  return (
    <components.MultiValueLabel {...props}>
      <strong>{group}</strong>
      <span style={{ margin: '0 4px' }}>/</span>
      {label}
    </components.MultiValueLabel>
  );
};

type DimensionsSuggestionComponentProps = {
  showAliasSuggestions: boolean;
  activeSuggestionField: string | null;
  activeSuggestionIndex: number;
  aliasTagOptions: Array<ComboboxOption<string>>,
  onSelectAliasSuggestion: (opt: ComboboxOption<string>) => void,
  aliasSuggestionFilter: string,
  field: 'aliasBy' | 'prefix' | null,
}

const DimensionsSuggestionComponent = (props: DimensionsSuggestionComponentProps) => {

  const { aliasSuggestionFilter, showAliasSuggestions, activeSuggestionField, activeSuggestionIndex, aliasTagOptions, onSelectAliasSuggestion, field } = props;
  if (!showAliasSuggestions || activeSuggestionField !== field) {
    return null;
  }

  const filteredSuggestions = aliasTagOptions.filter(opt =>
    opt.value?.toLowerCase().includes(aliasSuggestionFilter) ||
    opt.label?.toLowerCase().includes(aliasSuggestionFilter)
  );

  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      zIndex: 1000,
      backgroundColor: 'var(--background-primary, #111)',
      border: '1px solid var(--border-medium, #333)',
      borderRadius: '4px',
      maxHeight: '200px',
      overflowY: 'auto',
      minWidth: '300px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    }}>
      {filteredSuggestions.map((opt, idx) => (
        <div
          key={opt.value || idx}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-weak, #222)',
            backgroundColor: idx === activeSuggestionIndex ? 'var(--background-secondary, #222)' : 'transparent',
          }}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur
            onSelectAliasSuggestion(opt);
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLDivElement).style.backgroundColor = 'var(--background-secondary, #222)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLDivElement).style.backgroundColor = 'transparent';
          }}
        >
          <div style={{ fontWeight: 500 }}>{opt.label}</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>{opt.value}</div>
        </div>
      ))}
      {filteredSuggestions.length === 0 && (
        <div style={{ padding: '8px 12px', opacity: 0.6 }}>
          No matching tags. Select dimensions first.
        </div>
      )}
    </div>
  );
}