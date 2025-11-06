import { DataSource } from './DataSource';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Stack, Input, Button, Field, Label, Combobox, ComboboxOption, MultiSelect } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import React, { useEffect, useState } from 'react';
import _ from 'lodash';

export interface Query extends DataQuery {
  mode: DataMode;
  sites: SelectableValue[];
  device: string | null;
  metric: string;
  unit: string;
  hostnameLookup: string;
  prefix: string;
  customFilters: CustomFilter[];
  // TODO: enum
  conjunctionOperator: ConjunctionOperator;
}

type Options = {};
type Props = QueryEditorProps<DataSource, Query, Options>;

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

export const DEFAULT_QUERY = {
  mode: DataMode.GRAPH,
  sites: null,
  device: null,
  metric: null,
  unit: null,
  hostnameLookup: null,
  prefix: '',
  customFilters: [],
  conjunctionOperator: ConjunctionOperator.AND,
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

export const QueryEditor: React.FC<Props> = (props: Props) => {
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
    devices: [] as Array<ComboboxOption<string>>,
    metrics: [] as Array<ComboboxOption<string>>,
    units: [] as Array<ComboboxOption<string>>,
    tagKeys: [] as Array<ComboboxOption<string>>,
    tagValues: [] as Array<Array<ComboboxOption<string>>>,
    operators: getOperators(),
    isLoading: true,
    isDevicesLoading: true,
  });

  useEffect(() => {
    const init = async () => {
      const [sites, devices, metrics, units, tagKeys] = await Promise.all([
        fetchSites(),
        fetchDevices(),
        fetchMetrics(),
        fetchUnits(),
        fetchTagKeys(),
      ]);

      setState({
        ...state,
        sites,
        devices,
        metrics,
        units,
        tagKeys,
        isLoading: false,
        isDevicesLoading: false,
      });
    };
    init();
    // eslint-disable-next-line
  }, []);

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

  const fetchMetrics = async (): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('metrics()', '$metric');
  };

  const fetchUnits = async (): Promise<Array<ComboboxOption<string>>> => {
    return getOptions('units()', '$unit');
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
    props.onChange(query);
    props.onRunQuery();
  };

  const onConjuctionOperatorSelect = (option: ComboboxOption<string>) => {
    if (_.isNil(option.value)) {
      return;
    }
    const customFilters = _.cloneDeep(props.query.customFilters);
    for (let filter of customFilters) {
      filter.conjunctionOperator = option.value;
    }
    props.onChange({ ...props.query, conjunctionOperator: option.value as ConjunctionOperator, customFilters });
    props.onRunQuery();
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
    props.onChange({ ...props.query, customFilters });
    if (field === 'keySegment') {
      const tagValues = await fetchTagValues(customFilters[filterIdx].keySegment as string);
      const stateValues = _.cloneDeep(state.tagValues);
      stateValues[filterIdx] = tagValues;
      setState({
        ...state,
        tagValues: stateValues,
      });
    } else {
      props.onRunQuery();
    }
  };

  const onAddFilterButtonClick = () => {
    const defaultFilter: CustomFilter = {
      keySegment: null,
      operatorSegment: '=',
      valueSegment: null,
      conjunctionOperator: 'AND',
    };
    props.onChange({ ...props.query, customFilters: [...props.query.customFilters, defaultFilter] });
  };

  const onDeleteFilterButtonClick = (filterIdx: number) => {
    props.onChange({
      ...props.query,
      customFilters: props.query.customFilters.filter((filter: any, idx: number) => idx !== filterIdx),
    });
    props.onRunQuery();
  };

  const onSitesSelect = async (value: SelectableValue<string>[]) => {
    const query: Query = _.cloneDeep(props.query);
    query['sites'] = value;
    query.device = null;
    props.onChange(query);

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
        <Field label="Site">
          <MultiSelect
            placeholder={state.isLoading ? 'Loading...' : 'all'}
            value={props.query.sites || []}
            disabled={state.isLoading}
            options={state.isLoading ? [] : state.sites}
            width={20}
            onChange={(value) => onSitesSelect(value)}
          />
        </Field>
        <Field label="Device">
          <Combobox
            placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
            disabled={state.isLoading}
            value={props.query.device}
            options={state.devices}
            width={20}
            onChange={(option) => onOptionSelect('device', option)}
          />
        </Field>
      </Stack>
      <Stack direction="row">
        <Field label="Metric">
          <Combobox
            placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
            disabled={state.isLoading}
            value={props.query.metric}
            options={state.metrics}
            width={20}
            onChange={(option) => onOptionSelect('metric', option)}
          />
        </Field>
        <Field label="Unit">
          <Combobox
            placeholder={state.isDevicesLoading ? 'Loading...' : 'Select...'}
            disabled={state.isLoading}
            value={props.query.unit}
            options={state.units}
            width={20}
            onChange={(option) => onOptionSelect('unit', option)}
          />
        </Field>
      </Stack>
      <Stack direction="row">
        <Field label="DNS Lookup">
          <Combobox
            value={props.query.hostnameLookup}
            options={convertToComboboxOptions(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={20}
            placeholder='Select...'
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />
        </Field>
        <Field label="Prefix">
          <Input
            type="text"
            width={20}
            value={props.query.prefix}
            onChange={(e) => props.onChange({ ...props.query, prefix: e.currentTarget.value })}
            onBlur={props.onRunQuery}
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
