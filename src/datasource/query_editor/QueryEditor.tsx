import { DEFAULT_QUERY, KentikDataSource, KentikQuery } from '../new_datasource';

import { QueryEditorProps, SelectableValue, VariableModel } from '@grafana/data';
import { VerticalGroup, HorizontalGroup, Select, Input, Button, Field } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';

import React, { useEffect, useState } from 'react';

import _ from 'lodash';

type Options = {};
type Props = QueryEditorProps<KentikDataSource, KentikQuery, Options>;

export type QueryItem = {
  value: string;
  text: string;
};

const QUERY_MODES: QueryItem[] = [
  { value: 'graph', text: 'Graph' },
  { value: 'table', text: 'Table' },
];

const HOSTNAME_LOOKUP_CHOICES = [
  { value: 'enabled', text: 'Enabled' },
  { value: 'disabled', text: 'Disabled' },
];

// TODO: default query values
export const QueryEditor: React.FC<Props> = (props: Props) => {
  _.defaults(props.query, DEFAULT_QUERY);

  const [state, setState] = useState({
    sites: [] as SelectableValue<string>[],
    devices: [] as SelectableValue<string>[],
    metrics: [] as SelectableValue<string>[],
    units: [] as SelectableValue<string>[],
    isLoading: true,
  });

  useEffect(() => {
    const init = async () => {
      const [sites, devices, metrics, units] = await Promise.all([
        fetchSites(),
        fetchDevices(),
        fetchMetrics(),
        fetchUnits(),
      ]);

      setState({
        ...state,
        sites,
        devices,
        metrics,
        units,
        isLoading: false,
      });
    };
    init();
    // eslint-disable-next-line
  }, []);

  const convertToSelectableValues = (items: QueryItem[]): SelectableValue<string>[] => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  };

  const variableExists = (variableName: string): boolean => {
    const templateSrv = getTemplateSrv();
    const variables = templateSrv.getVariables().map((variable: VariableModel) => `$${variable.name}`);
    return _.includes(variables, variableName);
  };

  const getOptions = async (query: string, variableName?: string): Promise<SelectableValue<string>[]> => {
    let metrics: QueryItem[] = await props.datasource.metricFindQuery(query, props.query);

    return convertToSelectableValues(
      appendVariableIfExists(metrics, variableName)
    );
  };

  const appendVariableIfExists = (options: QueryItem[], variableName?: string) => {
    if (variableName && variableExists(variableName)) {
      return [{ text: variableName, value: variableName }, ...options];
    }
    return options;
  }

  const fetchSites = async (): Promise<SelectableValue<string>[]> => {
    return getOptions('sites()');
  };

  const fetchDevices = async (): Promise<SelectableValue<string>[]> => {
    return getOptions('devices()', '$device');
  };

  const fetchMetrics = async (): Promise<SelectableValue<string>[]> => {
    return getOptions('metrics()', '$metric');
  };

  const fetchUnits = async (): Promise<SelectableValue<string>[]> => {
    return getOptions('units()', '$unit');
  };

  const onOptionSelect = (field: keyof KentikQuery, option: SelectableValue<string>) => {
    props.onChange({ ...props.query, [field]: option.value });
    props.onRunQuery();
  }

  return (
    <VerticalGroup>
      <HorizontalGroup>
        <Field label="Data Mode">
          <Select
            value={props.query.mode}
            options={convertToSelectableValues(QUERY_MODES)}
            width={20}
            onChange={(option) => onOptionSelect('mode', option)}
          />
        </Field>
      </HorizontalGroup>
      <HorizontalGroup>
        <Field label="Site">
          <Select
            placeholder="all"
            isLoading={state.isLoading}
            value={props.query.site}
            options={state.sites}
            width={20}
            onChange={(option) => onOptionSelect('site', option)}
          />
        </Field>
        <Field label="Device">
          <Select
            isLoading={state.isLoading}
            value={props.query.device}
            options={state.devices}
            width={20}
            onChange={(option) => onOptionSelect('device', option)}
          />
        </Field>
      </HorizontalGroup>
      <HorizontalGroup>
        <Field label="Metric">
          <Select
            isLoading={state.isLoading}
            value={props.query.metric}
            options={state.metrics}
            width={20}
            onChange={(option) => onOptionSelect('metric', option)}
          />
        </Field>
        <Field label="Unit">
          <Select
            isLoading={state.isLoading}
            value={props.query.unit}
            options={state.units}
            width={20}
            onChange={(option) => onOptionSelect('unit', option)}
          />
        </Field>
      </HorizontalGroup>
      <HorizontalGroup>
        <Field label="DNS Lookup">
          <Select
            value={props.query.hostnameLookup}
            options={convertToSelectableValues(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={20}
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />
        </Field>
        <Field label="Prefix">
          <Input
            type="text" 
            width={20}
            value={props.query.prefix ?? ''}
            onChange={(e) => props.onChange({ ...props.query, prefix: e.currentTarget.value })}
            onBlur={props.onRunQuery}
          />
        </Field>
      </HorizontalGroup>
      <HorizontalGroup>
        <Field label="Filters">
          {/* TODO: move onClick handler to a function */}
          <Button size="sm" icon="plus" variant="secondary" onClick={() => props.onChange({
             ...props.query, customFilters: [...props.query.customFilters, { keySegment: null, operatorSegment: '>', valueSegment: null }]
          })}></Button>
        </Field>
      </HorizontalGroup>
      {props.query.customFilters.map((filter: any, filterIdx: number) => 
        <HorizontalGroup>
          {/* TODO: proper select options */}
          <Select
            value={filter.keySegment}
            options={convertToSelectableValues(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={20}
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />

          <Select
            value={filter.operatorSegment}
            options={convertToSelectableValues(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={20}
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />

          <Select
            value={filter.valueSegment}
            options={convertToSelectableValues(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
            width={20}
            onChange={(option) => onOptionSelect('hostnameLookup', option)}
          />

          {/* TODO: move onClick handler to a function */}
          <Button size="sm" icon="trash-alt" variant="secondary" onClick={() => props.onChange({
            ...props.query, customFilters: props.query.customFilters.filter((filter: any, idx: number) => idx !== filterIdx)
          })}></Button>
        </HorizontalGroup>
      )}
    </VerticalGroup>
  );
};
