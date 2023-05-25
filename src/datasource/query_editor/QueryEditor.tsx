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

  const getSelectableValues = async (query: string, variableName?: string): Promise<QueryItem[]> => {
    let metrics: QueryItem[] = await props.datasource.metricFindQuery(query, props.query);
    if (variableName && variableExists(variableName)) {
      metrics = [{ text: variableName, value: variableName }, ...metrics];
    }

    return metrics;
  };

  const fetchSites = async (): Promise<QueryItem[]> => {
    return getSelectableValues('sites()');
  };

  const fetchDevices = async (): Promise<QueryItem[]> => {
    return getSelectableValues('devices()', '$device');
  };

  const fetchMetrics = async (): Promise<QueryItem[]> => {
    return getSelectableValues('metrics()', '$metric');
  };

  const fetchUnits = async (): Promise<QueryItem[]> => {
    return getSelectableValues('units()', '$unit');
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
    </VerticalGroup>
  );
};
