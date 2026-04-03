import { ALL_DEVICES_LABEL, ALL_SITES_LABEL, DataSource } from './DataSource';
import { GrafanaTheme2, QueryEditorProps, SelectableValue } from '@grafana/data';
import { Stack, Input, Button, Field, Label, Combobox, ComboboxOption, MultiCombobox, FieldValidationMessage, useStyles2 } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import React, { useEffect, useState, useRef } from 'react';
import _ from 'lodash';
import { css } from '@emotion/css';
import { dimensionList, DimensionCategory } from './metric_def';
import { DimensionClass } from './metric_types';

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

// Helper to append a variable option if it exists in Grafana variables
function appendVariableIfExists(options: QueryItem[], variableName: string): QueryItem[] {
  const templateSrv = getTemplateSrv();
  const variableExists = templateSrv.getVariables().some((v: any) => `$${v.name}` === variableName);
  if (variableExists) {
    return [{ value: variableName, text: variableName }, ...options];
  }
  return options;
}

const OBLIGATORY_FIELDS_NAMES = ['sites', 'dimension', 'metric'];

export const QueryEditor: React.FC<QueryEditorComponentProps> = (props) => {
  _.defaults(props.query, DEFAULT_QUERY);

  const s = useStyles2(getQueryEditorStyles);
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
    sites: [] as Array<ComboboxOption<string>>,
    devices: [] as Array<ComboboxOption<string>>,
    dimensions: [] as Array<ComboboxOption<string>>,
    metrics: [] as Array<ComboboxOption<string>>,
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

  // Local state for text inputs — updated on every keystroke for a responsive UI
  // but only committed to the query (props.onChange) on blur / Enter so the
  // dashboard isn't marked dirty until the user finishes editing.
  const [localAliasBy, setLocalAliasBy] = useState(props.query.aliasBy || '');
  const [localPrefix, setLocalPrefix] = useState(props.query.prefix || '');
  const [localTopx, setLocalTopx] = useState(props.query.topx ?? '');

  // Keep local state in sync when the query changes externally
  // (e.g. dimension swap updating aliasBy, or dashboard variable refresh)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local controlled input state from props
  useEffect(() => { setLocalAliasBy(props.query.aliasBy || ''); }, [props.query.aliasBy]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local controlled input state from props
  useEffect(() => { setLocalPrefix(props.query.prefix || ''); }, [props.query.prefix]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local controlled input state from props
  useEffect(() => { setLocalTopx(props.query.topx ?? ''); }, [props.query.topx]);
  const [errorState, setErrorState] = useState<Record<string, string>>({
    sites: '',
    devices: '',
    dimension: '',
    metric: ''
  })

  const getOptions = async (
    query: string,
    variableName?: string,
    target?: any
  ): Promise<Array<ComboboxOption<string>>> => {
    let result = await props.datasource.metricFindQuery(query, target || props.query);

    const templateSrv = getTemplateSrv();
    const variables: Array<ComboboxOption<string>> = templateSrv.getVariables().map((variable) => ({
      label: `$${variable.name}`,
      value: `$${variable.name}`
    }));

    // Handle grouped options from metricNestedList
    const isGrouped = result.some((item: any) => item.options && Array.isArray(item.options));

    let options: Array<ComboboxOption<string>> = [];
    if (isGrouped) {
      options = result.flatMap((group: any) =>
        (group.options || []).map((opt: any) => ({
          ...opt,
          label: `${group.label} / ${opt.text || opt.label}`,
          value: opt.value,
          description: group.label,
          group: group.label,
          compatibleCategory: group.compatibleCategory,
        }))
      );
    } else {
      options = result.map((item: any) => ({
        label: item.text || item.label,
        value: item.value,
        ...item
      }));
    }

    return [...variables, ...options];
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [sites, devices, dimensions, metrics, tagKeys, customDimensions] = await Promise.all([
          getOptions('sites()'),
          getOptions('devices()', '$device'),
          getOptions('dimensions()', '$dimension'),
          getOptions('metrics()', '$metric'),
          (async () => {
            const keys: Array<{ text: string; field: string }> = await props.datasource.getTagKeys();
            const items: QueryItem[] = keys.map((key) => ({ value: key.text, text: key.text }));
            const templateSrv = getTemplateSrv();
            const vars = _.map(templateSrv.getVariables(), (variable) => `$${variable.name}`);
            const fmtVars: QueryItem[] = _.map(vars, (v: string) => ({ value: v, text: v }));
            return convertToComboboxOptions(_.concat(fmtVars, items));
          })(),
          props.datasource.getCustomDimensions(),
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
        setState(s => ({ ...s, isLoading: false, isDevicesLoading: false }));
      }
    };
    init();
    // eslint-disable-next-line
  }, []);

  // Helper to ensure multi-select fields are always arrays of SelectableValues
  const ensureArray = (value: any): SelectableValue[] => {
    if (Array.isArray(value)) {
      // Normalise plain strings (e.g. from saved dashboard JSON) into SelectableValue objects
      return value.map(v =>
        typeof v === 'string' ? { value: v, label: v } : v
      );
    }
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map(v => ({ value: v, label: v }));
    }
    return [];
  };

  // Update alias tag options when dimensions or metrics change
  useEffect(() => {
    const templateSrv = getTemplateSrv();
    const selectedDimensions = ensureArray(props.query.dimension);
    const selectedDimensionValues = selectedDimensions.map((d: SelectableValue<string>) => d.value);

    // Determine query type from selected dimensions
    const hasSnmpDims = selectedDimensionValues.some(
      (v): v is string => typeof v === 'string' && v.startsWith('ktappprotocol__')
    );
    const isFlowQuery = !hasSnmpDims;

    // For SNMP queries, extract the protocol prefix so we can build
    // SNMP-compatible common field suggestions.
    // e.g. "ktappprotocol__snmp_device_metrics__i_device_site_name"
    //    → prefix = "ktappprotocol__snmp_device_metrics__"
    let snmpProtocolPrefix: string | null = null;
    if (hasSnmpDims) {
      const snmpDim = selectedDimensionValues.find(
        (v): v is string => typeof v === 'string' && v.startsWith('ktappprotocol__')
      );
      if (snmpDim) {
        const lastSep = snmpDim.lastIndexOf('__');
        snmpProtocolPrefix = lastSep > 0 ? snmpDim.slice(0, lastSep + 2) : null;
      }
    }

    // ── Built-in tokens ────────────────────────────────────────────────────
    const builtInOptions: Array<ComboboxOption<string>> = [
      { label: 'Aggregate function ($col)', value: '$col', description: 'e.g. "95th Percentile"', group: 'Built-in' },
      { label: 'Metric group ($metric_group)', value: '$metric_group', description: 'e.g. "SNMP Device CPU (%)"', group: 'Built-in' },
    ];

    // ── Common Fields (context-aware) ──────────────────────────────────────
    // For flow queries: show standard flow common fields that can be injected.
    // For SNMP queries: show SNMP-compatible device/site fields from the same
    // protocol family.  Only options that resolve to valid dimensionList
    // entries are included.
    let commonFieldOptions: Array<ComboboxOption<string>> = [];

    if (isFlowQuery) {
      // Standard flow common fields — all injectable via extractAliasDimensions
      commonFieldOptions = [
        { label: 'Device ({{device}})', value: '{{device}}', group: 'Common Fields' },
        { label: 'Site ({{site}})', value: '{{site}}', group: 'Common Fields' },
        { label: 'Application ({{application}})', value: '{{application}}', group: 'Common Fields' },
        { label: 'Protocol ({{Proto}})', value: '{{Proto}}', group: 'Common Fields' },
        { label: 'Source IP/CIDR ({{IP_src}})', value: '{{IP_src}}', group: 'Common Fields' },
        { label: 'Destination IP/CIDR ({{IP_dst}})', value: '{{IP_dst}}', group: 'Common Fields' },
        { label: 'Source AS Number ({{AS_src}})', value: '{{AS_src}}', group: 'Common Fields' },
        { label: 'Destination AS Number ({{AS_dst}})', value: '{{AS_dst}}', group: 'Common Fields' },
      ];
    } else if (snmpProtocolPrefix) {
      // SNMP/ST: build common fields from the same protocol family
      const snmpCommon: Array<{ label: string; suffix: string }> = [
        { label: 'Device', suffix: 'i_device_name' },
        { label: 'Site', suffix: 'i_device_site_name' },
      ];
      for (const item of snmpCommon) {
        const dimValue = snmpProtocolPrefix + item.suffix;
        const dim = dimensionList.find((d) => d.value === dimValue);
        if (dim) {
          commonFieldOptions.push({
            label: `${item.label} ({{${dim.field}}})`,
            value: `{{${dim.field}}}`,
            group: 'Common Fields',
          });
        }
      }
    }

    // Track covered values for deduplication
    const coveredValues = new Set([
      ...builtInOptions.map((o) => o.value),
      ...commonFieldOptions.map((o) => o.value),
    ]);

    // ── Selected dimensions (standard) ─────────────────────────────────────
    const standardDimensionOptions: Array<ComboboxOption<string>> = dimensionList
      .filter((dim) => selectedDimensionValues.includes(dim.value))
      .filter((dim) => !coveredValues.has(`{{${dim.field}}}`))
      .map((dim) => ({
        label: `${dim.text} ({{${dim.field}}})`,
        value: `{{${dim.field}}}`,
        group: 'Dimensions',
      }));

    // ── Variables used as dimensions ────────────────────────────────────────
    const variableDimensionOptions: Array<ComboboxOption<string>> = selectedDimensionValues
      .filter((val): val is string => !!(val && val.startsWith('$')))
      .map((val) => ({
        label: val,
        value: `{{${val}}}`,
        group: 'Dimensions',
      }));

    // ── Injectable dimensions ──────────────────────────────────────────────
    // Show additional dimensions that are compatible with the current query
    // type and can be auto-injected.  For flow queries: other flow dimensions
    // (excluding already-selected and common fields).  For SNMP: other
    // dimensions from the same protocol family.
    const allCoveredValues = new Set([
      ...Array.from(coveredValues),
      ...standardDimensionOptions.map((o) => o.value),
    ]);
    let injectableDimensionOptions: Array<ComboboxOption<string>> = [];
    if (isFlowQuery) {
      injectableDimensionOptions = dimensionList
        .filter((dim) => !dim.class || dim.class === DimensionClass.FLOW)
        .filter((dim) => !allCoveredValues.has(`{{${dim.field}}}`))
        .map((dim) => ({
          label: `${dim.text} ({{${dim.field}}})`,
          value: `{{${dim.field}}}`,
          group: 'More Dimensions',
        }));
    } else if (snmpProtocolPrefix) {
      injectableDimensionOptions = dimensionList
        .filter((dim) => dim.value.startsWith(snmpProtocolPrefix!))
        .filter((dim) => !allCoveredValues.has(`{{${dim.field}}}`))
        .map((dim) => ({
          label: `${dim.text} ({{${dim.field}}})`,
          value: `{{${dim.field}}}`,
          group: 'More Dimensions',
        }));
    }

    // ── Custom dimensions ──────────────────────────────────────────────────
    const customDimensionOptions: Array<ComboboxOption<string>> = (state.customDimensions || [])
      .filter((dim: AliasByComboboxOption<string>): dim is AliasByComboboxOption<string> & { originalValue: string } => 
         typeof dim.originalValue === 'string' && selectedDimensionValues.includes(dim.originalValue))
      .map((dim) => {
        const originalVal = dim.originalValue;
        const isVariable = originalVal.startsWith('$');
        const value = isVariable ? originalVal : `{{${originalVal}}}`;
        const labelText = dim.label || originalVal;
        const label = isVariable ? labelText : `${labelText} (${value})`;
        return {
          label,
          value,
          group: 'Dimensions',
        };
      });

    // ── Grafana dashboard variables ────────────────────────────────────────
    const dimensionVarNames = new Set(
      selectedDimensionValues
        .filter((val): val is string => !!(val && val.startsWith('$')))
        .map((val) => val)
    );
    const grafanaVariableOptions: Array<ComboboxOption<string>> = templateSrv
      .getVariables()
      .filter((v: any) => !dimensionVarNames.has(`$${v.name}`))
      .map((v: any) => ({
        label: `$${v.name}`,
        value: `$${v.name}`,
        description: v.label || v.description || undefined,
        group: 'Dashboard Variables',
      }));

    const aliasTagOptions = [
      ...builtInOptions,
      ...commonFieldOptions,
      ...standardDimensionOptions,
      ...variableDimensionOptions,
      ...injectableDimensionOptions,
      ...customDimensionOptions,
      ...grafanaVariableOptions,
    ];

    // eslint-disable-next-line react-hooks/set-state-in-effect -- deriving alias tag options from dimension/customDimensions props
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

  const onOptionSelect = async (field: keyof Query, option: ComboboxOption<string>) => {
    if (option.value === undefined) {
      return;
    }
    const query: Query = _.cloneDeep(props.query);
    (query as Record<keyof Query, unknown>)[field] = option.value;

    onQueryChange(query);
    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  };

  const onOptionChange = (field: keyof Query, value: string) => {
    // Update local state only — committed to the query on blur
    if (field === 'topx') {
      setLocalTopx(value);
      return;
    }
    const query = _.cloneDeep(props.query);
    (query as Record<keyof Query, unknown>)[field] = value;

    onQueryChange(query);
    isQueryValid(query)
  };

  const onDeviceSelect = (value: SelectableValue[]) => {
    const query: Query = _.cloneDeep(props.query);
    query['devices'] = value as Query['devices'];

    onQueryChange(query);
    isQueryValid(query)
  }

  const onMetricSelect = (value: SelectableValue[]) => {
    const query: Query = _.cloneDeep(props.query);
    query['metric'] = value;

    onQueryChange(query);
    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  }

  const onTopXBlur = () => {
    const query = _.cloneDeep(props.query);
    // Commit local topx value
    query.topx = localTopx;
    let queryValid = false;
    if (!query.topx || _.toNumber(query.topx) <= 0) {
      query.topx = DEFAULT_TOPX;
      setLocalTopx(DEFAULT_TOPX);
    }
    onQueryChange(query);
    queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  };

  const onDimensionSelect = (value: SelectableValue[]) => {
    const oldDimensions = ensureArray(props.query.dimension);
    const newDimensions = value;

    const oldValues = oldDimensions.map(d => d.value);
    const newValues = newDimensions.map(d => d.value);

    const removedIds = oldValues.filter(v => !newValues.includes(v));
    const addedIds = newValues.filter(v => !oldValues.includes(v));

    let newAliasBy = props.query.aliasBy || '';

    if (removedIds.length === 1 && addedIds.length === 1) {
      const removedId = removedIds[0];
      const addedId = addedIds[0];

      const findDim = (id: any) => state.dimensions.find(d => d.value === id);
      const removedDim = findDim(removedId);
      const addedDim = findDim(addedId);

      if (removedDim && addedDim) {
        let removedField = (removedDim as ComboboxOption & { field?: string; text?: string })['field'];
        let addedField = (addedDim as ComboboxOption & { field?: string; text?: string })['field'];
        let removedText = (removedDim as ComboboxOption & { field?: string; text?: string })['text'];
        let addedText = (addedDim as ComboboxOption & { field?: string; text?: string })['text'];

        // Handle variables (which don't have field/text properties but value starts with $)
        if (!removedField && removedDim.value?.toString().startsWith('$')) {
          removedField = removedDim.value;
          removedText = removedDim.value;
        }
        if (!addedField && addedDim.value?.toString().startsWith('$')) {
          addedField = addedDim.value;
          addedText = addedDim.value;
        }

        if (removedField && addedField) {
          // Determine the target tag for the new field
          const getTag = (field: string) => `{{${field}}}`;
          const newTag = getTag(addedField);

          // Try replacing both legacy ($tag_) and new ({{}}) formats
          const oldTags = [
            removedField.startsWith('$') ? removedField : `$tag_${removedField}`, // Legacy/Variable
            `{{${removedField}}}` // Handlebars
          ];

          oldTags.forEach(oldTag => {
            if (newAliasBy.includes(oldTag)) {
              newAliasBy = newAliasBy.split(oldTag).join(newTag);
            }
          });
        }

        if (removedText && addedText) {
          const oldHandlebars = `{{${removedText}}}`;
          const newHandlebars = `{{${addedText}}}`;
          if (newAliasBy.includes(oldHandlebars)) {
            newAliasBy = newAliasBy.split(oldHandlebars).join(newHandlebars);
          }
        }
      }
    }

    const query: Query = _.cloneDeep(props.query);
    query['dimension'] = value as Query['dimension'];

    if (newAliasBy !== props.query.aliasBy) {
      query.aliasBy = newAliasBy;
    }

    onQueryChange(query);
    const dimensionLimitReached = query.dimension?.length >= MAX_DIMENSIONS;
    setState({
      ...state,
      dimensions: state.dimensions.map((dimension: ComboboxOption<string>) => ({ ...dimension, isDisabled: dimensionLimitReached })),
    });

    const queryValid = isQueryValid(query);
    onRunQuery(queryValid);
  }

  // Find the current "$..." or "{{..." token being typed at cursor position
  const findCurrentToken = (value: string, cursorPos: number): { token: string; start: number } | null => {
    // Look backwards from cursor to find a $ or { that starts a token.
    // Stop at `}` (end of a previous token), space, or start-of-value so we
    // never accidentally swallow an already-completed {{...}} pattern.
    let start = cursorPos - 1;
    while (start >= 0 && value[start] !== '$' && value[start] !== '{' && value[start] !== ' ' && value[start] !== '}') {
      start--;
    }

    if (start >= 0 && (value[start] === '$' || value[start] === '{')) {
      // Consume all consecutive opening braces so "{{" is captured as one token start
      while (start > 0 && value[start - 1] === '{') {
        start--;
      }
      const token = value.slice(start, cursorPos);
      return { token, start };
    }
    return null;
  };

  const onAliasMouseUp = (e: React.MouseEvent<HTMLInputElement>, field: 'aliasBy' | 'prefix') => {
    const cursorPos = e.currentTarget.selectionStart || 0;
    const currentValue = field === 'aliasBy' ? localAliasBy : localPrefix;
    const tokenInfo = findCurrentToken(currentValue, cursorPos);
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

    // Update local state only — don't call onQueryChange yet (deferred to blur)
    if (field === 'aliasBy') {
      setLocalAliasBy(newValue);
    } else {
      setLocalPrefix(newValue);
    }

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

    const rawFilter = state.aliasSuggestionFilter.toLowerCase();
    const strippedFilter = rawFilter.replace(/^[\${]+/, '');

    const filteredSuggestions = state.aliasTagOptions.filter(opt => {
      const val = opt.value?.toLowerCase() || '';
      const lbl = opt.label?.toLowerCase() || '';
      if (val.includes(rawFilter) || lbl.includes(rawFilter)) {
        return true;
      }
      if (strippedFilter === '') {
        return true;
      }
      return val.includes(strippedFilter) || lbl.includes(strippedFilter);
    });

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
    const currentValue = field === 'aliasBy' ? localAliasBy : localPrefix;
    const cursorPos = input?.selectionStart || currentValue.length;

    // Find the token being completed
    const tokenInfo = findCurrentToken(currentValue, cursorPos);

    let newValue: string;
    if (tokenInfo) {
      // Replace the partial token with the full value.
      // Also consume any stray leading `{` before the token and trailing `}`
      // after the cursor to avoid brace duplication (e.g. user types `{` then
      // picks `{{device}}` from suggestions → without this we'd get `{{{device}}}`).
      let startPos = tokenInfo.start;
      let endPos = cursorPos;
      if (option.value.startsWith('{{')) {
        while (startPos > 0 && currentValue[startPos - 1] === '{') {
          startPos--;
        }
      }
      if (option.value.endsWith('}}')) {
        while (endPos < currentValue.length && currentValue[endPos] === '}') {
          endPos++;
        }
      }
      newValue = currentValue.slice(0, startPos) + option.value + currentValue.slice(endPos);
    } else {
      // Just append
      newValue = currentValue + option.value;
    }

    // Update local state — committed to query on blur
    if (field === 'aliasBy') {
      setLocalAliasBy(newValue);
    } else {
      setLocalPrefix(newValue);
    }
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

  const onAliasTextBlur = (field: 'aliasBy' | 'prefix'): void => {
    // Commit the local text value to the query on blur
    const localValue = field === 'aliasBy' ? localAliasBy : localPrefix;
    if (localValue !== (props.query[field] || '')) {
      onQueryChange({ ...props.query, [field]: localValue });
    }
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

    const devices = await getOptions('devices()', '$device', query);

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

  // ── Dimension ↔ Metric cross-filtering ──────────────────────────────────
  // NMS categories require matched dimensions and metrics AND specific devices;
  // flow categories (no compatibleCategory / no category) are always mutually compatible.
  const NMS_CATEGORIES = new Set<string>([
    DimensionCategory.SNMP_DEVICE,
    DimensionCategory.SNMP_INTERFACE,
    DimensionCategory.ST_INTERFACE,
  ]);

  const selectedDimensions = ensureArray(props.query.dimension);
  const selectedMetrics = ensureArray(props.query.metric);

  // Categories present in the currently selected dimensions
  const selectedDimCategories = new Set(
    selectedDimensions
      .map((d) => {
        const dim = dimensionList.find((dl) => dl.value === d.value);
        return dim?.category;
      })
      .filter(Boolean) as string[]
  );
  const hasNmsDim = [...selectedDimCategories].some((c) => NMS_CATEGORIES.has(c));
  const hasFlowDim = selectedDimensions.length === 0 ||
    selectedDimensions.some((d) => {
      const dim = dimensionList.find((dl) => dl.value === d.value);
      return !dim?.category || !NMS_CATEGORIES.has(dim.category);
    });

  // compatibleCategory values present in the currently selected metrics
  const selectedMetricCompat = new Set(
    selectedMetrics
      .map((m) => {
        const opt = state.metrics.find((o: any) => o.value === m.value);
        return (opt as any)?.compatibleCategory;
      })
      .filter(Boolean) as string[]
  );
  const hasNmsMetric = [...selectedMetricCompat].some((c) => NMS_CATEGORIES.has(c));
  const hasFlowMetric = selectedMetrics.length === 0 ||
    selectedMetrics.some((m) => {
      const opt = state.metrics.find((o: any) => o.value === m.value);
      return !(opt as any)?.compatibleCategory;
    });

  // Grey-out (disable) incompatible metrics based on selected dimensions
  // AND selected metrics (can't mix flow + NMS metric types).
  const filteredMetrics = state.metrics.map((metric: any) => {
    let compatible = true;

    // Dimension-based constraints
    if (selectedDimensions.length > 0) {
      if (!metric.compatibleCategory) {
        compatible = hasFlowDim && !hasNmsDim;
      } else {
        compatible = selectedDimCategories.has(metric.compatibleCategory);
      }
    }

    // Metric-to-metric constraints: once a metric type is chosen,
    // disable metrics of incompatible types (flow vs NMS).
    if (compatible && selectedMetrics.length > 0) {
      const isNmsMetricOption = metric.compatibleCategory && NMS_CATEGORIES.has(metric.compatibleCategory);
      if (!isNmsMetricOption) {
        // This is a flow metric — only compatible if existing selection includes flow
        compatible = hasFlowMetric && !hasNmsMetric;
      } else {
        // This is an NMS metric — only compatible if existing selection matches its category
        compatible = !hasFlowMetric && (!hasNmsMetric || selectedMetricCompat.has(metric.compatibleCategory));
      }
    }

    return compatible ? metric : { ...metric, isDisabled: true };
  });

  // Grey-out (disable) incompatible dimensions based on selected metrics
  const filteredDimensions = state.dimensions.map((dim: any) => {
    let compatible = true;
    if (selectedMetrics.length > 0) {
      const isNmsDim = dim.category && NMS_CATEGORIES.has(dim.category);
      if (!isNmsDim) {
        compatible = hasFlowMetric && !hasNmsMetric;
      } else {
        compatible = selectedMetricCompat.has(dim.category);
      }
    }
    return compatible ? dim : { ...dim, isDisabled: true };
  });

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
        <Field label={<><span>Sites <span className={s.requiredIndicator}>*</span></span></>}>
          <>
            <MultiCombobox<string>
              placeholder={state.isLoading ? 'Loading...' : ALL_SITES_LABEL}
              value={ensureArray(props.query.sites).map((s: SelectableValue) => s.value as string)}
              loading={state.isLoading}
              options={state.isLoading ? [] : state.sites}
              width={40}
              onChange={(value: Array<ComboboxOption<string>>) => onSitesSelect(value)}
            />
            {errorState.sites && <FieldValidationMessage>{errorState.sites}</FieldValidationMessage>}
          </>
        </Field>
        <Field label="Devices">
          <>
            <MultiCombobox<string>
              placeholder={state.isDevicesLoading ? 'Loading...' : ALL_DEVICES_LABEL}
              loading={state.isDevicesLoading}
              value={ensureArray(props.query.devices).map((d: SelectableValue) => d.value as string)}
              options={state.devices}
              width={40}
              onChange={(value: Array<ComboboxOption<string>>) => onDeviceSelect(value)}
            />
            {errorState.devices && <FieldValidationMessage>{errorState.devices}</FieldValidationMessage>}
          </>
        </Field>
      </Stack>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Field label={<><span>Dimensions <span className={s.requiredIndicator}>*</span></span></>}>
          <>
            <MultiCombobox<string>
              placeholder={'Select...'}
              loading={state.isLoading}
              value={ensureArray(props.query.dimension).map((d: SelectableValue) => d.value as string)}
              options={filteredDimensions}
              width={40}
              onChange={(value: Array<ComboboxOption<string>>) => onDimensionSelect(value)}
            />
            {ensureArray(props.query.dimension).length >= MAX_DIMENSIONS && <div className={s.dimensionLimitMessage}>Max {MAX_DIMENSIONS} dimensions allowed.</div>}
            {errorState.dimension && <FieldValidationMessage>{errorState.dimension}</FieldValidationMessage>}
          </>
        </Field>
        <Field label={<><span>Metric <span className={s.requiredIndicator}>*</span></span></>}>
          <>
            <MultiCombobox<string>
              placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
              loading={state.isLoading}
              value={ensureArray(props.query.metric).map((m: SelectableValue) => m.value as string)}
              options={filteredMetrics}
              width={40}
              onChange={(value: Array<ComboboxOption<string>>) => onMetricSelect(value)}
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
              value={localPrefix}
              onChange={(e) => onAliasTextChange(e, 'prefix')}
              onKeyDown={onAliasKeyDown}
              onBlur={() => onAliasTextBlur('prefix')}
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
              value={localAliasBy}
              onChange={(e) => onAliasTextChange(e, 'aliasBy')}
              onKeyDown={onAliasKeyDown}
              onBlur={() => onAliasTextBlur('aliasBy')}
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
        <Field label="Visualization depth">
          <Input
            type="number"
            width={12}
            value={localTopx}
            onChange={(e) => onOptionChange('topx', e.currentTarget.value)}
            onBlur={onTopXBlur}
            placeholder='Type...'
          />
        </Field>
      </Stack>
      {props.query.customFilters.map((filter: CustomFilter, filterIdx: number) => (
        <Stack direction="column" gap={0.5} key={`custom-filter-stack-${filterIdx}`}>
          <div className={s.filterSpacer} />
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

  const s = useStyles2(getQueryEditorStyles);
  const { aliasSuggestionFilter, showAliasSuggestions, activeSuggestionField, activeSuggestionIndex, aliasTagOptions, onSelectAliasSuggestion, field } = props;
  if (!showAliasSuggestions || activeSuggestionField !== field) {
    return null;
  }

  const filterText = aliasSuggestionFilter.toLowerCase();
  const search = (filterText.startsWith('$') || filterText.startsWith('{'))
    ? filterText.replace(/^[\${]+/, '')
    : filterText;

  const filteredSuggestions = aliasTagOptions.filter(opt => {
    const val = opt.value?.toLowerCase() || '';
    const lbl = opt.label?.toLowerCase() || '';
    const desc = opt.description?.toLowerCase() || '';

    // Standard "includes"
    if (val.includes(filterText) || lbl.includes(filterText) || desc.includes(filterText)) {
      return true;
    }

    // Loose match for $ or { triggers: if user triggers suggestions, match against the content
    if (search === '') {
      return true; 
    }
    return val.includes(search) || lbl.includes(search) || desc.includes(search);
  });

  return (
    <div className={s.suggestionDropdown}>
      {filteredSuggestions.map((opt, idx) => {
        const prevGroup = idx > 0 ? filteredSuggestions[idx - 1].group : undefined;
        const showGroupHeader = opt.group && opt.group !== prevGroup;
        return (
          <React.Fragment key={`${opt.group || ''}-${opt.value || idx}`}>
            {showGroupHeader && (
              <div className={idx > 0 ? `${s.suggestionGroupHeader} ${s.suggestionGroupBorder}` : s.suggestionGroupHeader}>
                {opt.group}
              </div>
            )}
            <div
              className={idx === activeSuggestionIndex ? `${s.suggestionItem} ${s.suggestionItemActive}` : s.suggestionItem}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                onSelectAliasSuggestion(opt);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).classList.add(s.suggestionItemActive);
              }}
              onMouseLeave={(e) => {
                if (idx !== activeSuggestionIndex) {
                  (e.currentTarget as HTMLDivElement).classList.remove(s.suggestionItemActive);
                }
              }}
            >
              <div className={s.suggestionLabel}>{opt.label}</div>
              {opt.description && (
                <div className={s.suggestionDescription}>{opt.description}</div>
              )}
              <div className={s.suggestionValue}>{opt.value}</div>
            </div>
          </React.Fragment>
        );
      })}
      {filteredSuggestions.length === 0 && (
        <div className={s.suggestionEmpty}>
          No matching tags. Select dimensions first.
        </div>
      )}
    </div>
  );
}

const getQueryEditorStyles = (theme: GrafanaTheme2) => ({
  requiredIndicator: css`
    color: ${theme.colors.error.text};
  `,
  filterSpacer: css`
    height: ${theme.spacing(1)};
  `,
  dimensionLimitMessage: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  suggestionDropdown: css`
    position: absolute;
    top: 100%;
    left: 0;
    z-index: ${theme.zIndex.dropdown};
    background-color: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    max-height: 280px;
    overflow-y: auto;
    min-width: 300px;
    box-shadow: ${theme.shadows.z3};
  `,
  suggestionGroupHeader: css`
    padding: ${theme.spacing(0.75)} ${theme.spacing(1.5)} ${theme.spacing(0.5)};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: ${theme.typography.fontWeightBold};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${theme.colors.text.secondary};
  `,
  suggestionGroupBorder: css`
    border-top: 1px solid ${theme.colors.border.weak};
  `,
  suggestionItem: css`
    padding: ${theme.spacing(0.75)} ${theme.spacing(1.5)};
    cursor: pointer;
    background-color: transparent;
  `,
  suggestionItemActive: css`
    background-color: ${theme.colors.background.secondary};
  `,
  suggestionLabel: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  suggestionDescription: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    opacity: 0.6;
  `,
  suggestionValue: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    opacity: 0.7;
  `,
  suggestionEmpty: css`
    padding: ${theme.spacing(1)} ${theme.spacing(1.5)};
    opacity: 0.6;
  `,
});
