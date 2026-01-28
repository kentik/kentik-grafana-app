import { ALL_SITES_LABEL, DataSource } from './DataSource';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Stack, Input, Button, Field, Label, Combobox, ComboboxOption, MultiSelect, FieldValidationMessage } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import React, { useEffect, useState } from 'react';
import _ from 'lodash';

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
  });
  const [errorState, setErrorState] = useState<Record<string, string>>({
    sites: '',
    devices: '',
    dimension: '',
    metric: ''
  })

  useEffect(() => {
    const init = async () => {
      const [sites, devices, dimensions, metrics, tagKeys] = await Promise.all([
        fetchSites(),
        fetchDevices(),
        fetchDimensions(),
        fetchMetrics(),
        fetchTagKeys(),
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
      });
    };
    init();
    // eslint-disable-next-line
  }, []);

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


    setErrorState((oldState) => ({...oldState, ...errorMessages}))

    return false;
  }

  const onRunQuery = (queryValid?: boolean): void => {
    if (queryValid === false) {
      return;
    }

    props.onRunQuery();
  }

  // todo typing
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
    if (variableName === '$metric') {
      return metrics;
    }
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

  const fetchTagValues = async (keySegment: string) => {
    const values: QueryItem[] = await props.datasource.getTagValues({ key: keySegment });
    const items: QueryItem[] = values.map((value) => ({ value: value.text, text: value.text }));

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
      const stateValues = _.cloneDeep(state.tagValues);
      stateValues[filterIdx] = undefined as any;
      setState({
        ...state,
        tagValues: stateValues,
      });
    }

    onQueryChange({ ...props.query, customFilters });

    if (field === 'keySegment') {
      const tagValues = await fetchTagValues(customFilters[filterIdx].keySegment as string);
      const stateValues = _.cloneDeep(state.tagValues);
      stateValues[filterIdx] = tagValues;
      setState({
        ...state,
        tagValues: stateValues,
      });
    } else {
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
  }

  const onTextInputBlur = (): void => {
    const queryValid = isQueryValid(props.query);

    onRunQuery(queryValid);
  }

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
      <Stack direction="row">
        <Field label={<><span>Sites <span style={{color: 'red'}}>*</span></span></>}>
          <>
          <MultiSelect
            placeholder={state.isLoading ? 'Loading...' : ALL_SITES_LABEL}
            value={props.query.sites || []}
            disabled={state.isLoading}
            options={state.isLoading ? [] : state.sites}
            width={40}
            hideSelectedOptions={false}
            onChange={(value) => onSitesSelect(value)}
          />
            {errorState.sites && <FieldValidationMessage>{errorState.sites}</FieldValidationMessage>}
          </>
        </Field>
        <Field label={<><span>Devices <span style={{color: 'red'}}>*</span></span></>}>
          <>
          <MultiSelect
            placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
            disabled={state.isLoading}
            value={props.query.devices || []}
            options={state.devices}
            width={40}
            hideSelectedOptions={false}
            onChange={(value) => onDeviceSelect(value)}
          />
          {errorState.devices && <FieldValidationMessage>{errorState.devices}</FieldValidationMessage>}
          </>
        </Field>
      </Stack>
      <Stack direction="row">
        <Field label={<><span>Dimensions <span style={{color: 'red'}}>*</span></span></>}>
          <>
            <MultiSelect
              placeholder={'Select...'}
              disabled={state.isLoading}
              value={props.query.dimension}
              options={state.dimensions}
              width={40}
              hideSelectedOptions={false}
              onChange={(value) => onDimensionSelect(value)}
            />
            {props.query.dimension?.length >= MAX_DIMENSIONS && <div style={{ width: '150px' }}>Max {MAX_DIMENSIONS} dimensions allowed.</div>}
            {errorState.dimension && <FieldValidationMessage>{errorState.dimension}</FieldValidationMessage>}
          </>
        </Field>
        <Field label={<><span>Metric <span style={{color: 'red'}}>*</span></span></>}>
          <>
          <MultiSelect
            placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
            disabled={state.isLoading}
            value={props.query.metric}
            components={{
              MultiValueLabel,
            }}
            options={state.metrics}
            width={40}
            hideSelectedOptions={false}
            onChange={(value) => onMetricSelect(value)}
          />
            {errorState.metric && <FieldValidationMessage>{errorState.metric}</FieldValidationMessage>}
          </>
        </Field>
      </Stack>
      <Stack direction="row">
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
          <Input
            type="text"
            width={19.5}
            value={props.query.prefix}
            onChange={(e) => onQueryChange({ ...props.query, prefix: e.currentTarget.value })}
            onBlur={onTextInputBlur}
            placeholder='Type...'
          />
        </Field>
        <Field label="Alias by">
          <Input
            type="text"
            width={19.5}
            value={props.query.aliasBy}
            onChange={(e) => onQueryChange({ ...props.query, aliasBy: e.currentTarget.value })}
            onBlur={onTextInputBlur}
            placeholder='Type...'
          />
        </Field>
        <Field label="Visualization depth">
          <Input
            type="number"
            width={19.5}
            value={props.query.topx}
            onChange={(e) => onOptionChange('topx', e.currentTarget.value)}
            onBlur={onTopXBlur}
            placeholder='Type...'
          />
        </Field>
      </Stack>
      <Stack direction="row">
        <Field label="Filters">
          <Button size="sm" icon="plus" variant="secondary" onClick={onAddFilterButtonClick} aria-label="filters-button"></Button>
        </Field>
        {props.query.customFilters.length > 1 && (
          <Field label="">
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
        <Stack direction="row" key={`custom-filter-row-${filterIdx}`}>
          <Combobox
            value={filter.keySegment}
            options={state.tagKeys}
            width={20}
            placeholder='Select...'
            onChange={(option) => onFilterOptionSelect('keySegment', option, filterIdx)}
          />
          {!_.isNil(filter.keySegment) && (
            <Stack direction="row">
              <Combobox
                value={filter.operatorSegment}
                options={state.operators}
                width={20}
                placeholder='Select...'
                onChange={(option) => onFilterOptionSelect('operatorSegment', option, filterIdx)}
              />

              <Combobox
                placeholder={state.tagValues[filterIdx] === undefined ? 'Loading...' : 'Select...'}
                disabled={state.tagValues[filterIdx] === undefined}
                value={filter.valueSegment}
                options={state.tagValues[filterIdx] ?? []}
                width={20}
                onChange={(option) => onFilterOptionSelect('valueSegment', option, filterIdx)}
              />
            </Stack>
          )}
          <Button
            size="sm"
            icon="trash-alt"
            variant="secondary"
            onClick={() => onDeleteFilterButtonClick(filterIdx)}
            aria-label="trash-button"
          ></Button>
          {props.query.customFilters.length > 1 && <Label>{props.query.conjunctionOperator}</Label>}
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
