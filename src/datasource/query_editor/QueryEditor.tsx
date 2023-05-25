import { KentikDataSource, KentikQuery } from '../new_datasource';

import { QueryEditorProps, SelectableValue, VariableModel } from '@grafana/data';
import { VerticalGroup, HorizontalGroup, Label, Select } from '@grafana/ui';
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

export const QueryEditor: React.FC<Props> = (props: Props) => {
  const [state, setState] = useState({
    sites: [] as QueryItem[],
    devices: [] as QueryItem[],
    metrics: [] as QueryItem[],
    units: [] as QueryItem[],
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

  const convertToSelectableValues = (items: QueryItem[]): Array<SelectableValue<string>> => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  };

  const variableExists = (variableName: string): boolean => {
    const templateSrv = getTemplateSrv();
    const variables = templateSrv.getVariables().map((variable: VariableModel) => `$${variable.name}`);
    return _.includes(variables, variableName);
  };

  const getOptions = async (query: string, variableName?: string): Promise<QueryItem[]> => {
    let metrics: QueryItem[] = await props.datasource.metricFindQuery(query, props.query);

    return appendVariableIfExists(metrics, variableName);
  };

  const appendVariableIfExists = (options: QueryItem[], variableName?: string) => {
    if (variableName && variableExists(variableName)) {
      return [{ text: variableName, value: variableName }, ...options];
    }
    return options;
  }

  const fetchSites = async (): Promise<QueryItem[]> => {
    return getOptions('sites()');
  };

  const fetchDevices = async (): Promise<QueryItem[]> => {
    return getOptions('devices()', '$device');
  };

  const fetchMetrics = async (): Promise<QueryItem[]> => {
    return getOptions('metrics()', '$metric');
  };

  const fetchUnits = async (): Promise<QueryItem[]> => {
    return getOptions('units()', '$unit');
  };

  return (
    <VerticalGroup>
      <HorizontalGroup>
        <Label>Data Mode</Label>
        <Select
          value={props.query.mode}
          options={convertToSelectableValues(QUERY_MODES)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, mode: e.value as string })}
        />
      </HorizontalGroup>
      <HorizontalGroup>
        <Label>Site</Label>
        <Select
          placeholder="all"
          isLoading={state.isLoading}
          value={props.query.site}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, site: e.value as string })}
        />
        <Label>Device</Label>
        <Select
          isLoading={state.isLoading}
          value={props.query.device}
          options={convertToSelectableValues(state.devices)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, device: e.value as string })}
        />
      </HorizontalGroup>
      <HorizontalGroup>
        <Label>Metric</Label>
        <Select
          isLoading={state.isLoading}
          value={props.query.metric}
          options={convertToSelectableValues(state.metrics)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, metric: e.value as string })}
        />
        <Label>Unit</Label>
        <Select
          isLoading={state.isLoading}
          value={props.query.unit}
          options={convertToSelectableValues(state.units)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, unit: e.value as string })}
        />
      </HorizontalGroup>
      <HorizontalGroup>
        <Label>DNS Lookup</Label>
        <Select
          isLoading={state.isLoading}
          value={props.query.hostnameLookup}
          options={convertToSelectableValues(appendVariableIfExists(HOSTNAME_LOOKUP_CHOICES, '$dns_lookup'))}
          width={20}
          onChange={(e) => props.onChange({ ...props.query, hostnameLookup: e.value as string })}
        />
      </HorizontalGroup>
    </VerticalGroup>
  );
};
