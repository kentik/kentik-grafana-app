import { KentikDataSource, KentikQuery } from '../new_datasource';

import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { VerticalGroup, HorizontalGroup, Label, Select } from '@grafana/ui';

import React, { useEffect, useState } from 'react';

import _ from 'lodash';


type Options = {};
type Props = QueryEditorProps<KentikDataSource, KentikQuery, Options>;

export type QueryItem = {
  value: string;
  text: string;
}

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
  }, []);

  const convertToSelectableValues = (items: QueryItem[]): SelectableValue<string>[] => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  }

  const fetchDevices = async (): Promise<QueryItem[]> => {
    const devices = await props.datasource.metricFindQuery('devices()', props.query);
    return devices;
  }

  const fetchSites = async (): Promise<QueryItem[]> => {
    const sites = await props.datasource.metricFindQuery('sites()', props.query);
    return sites;
  }

  const fetchMetrics = async (): Promise<QueryItem[]> => {
    const metrics = await props.datasource.metricFindQuery('metrics()', props.query);
    return metrics;
  }

  const fetchUnits = async (): Promise<QueryItem[]> => {
    const units = await props.datasource.metricFindQuery('units()', props.query);
    return units;
  }

  return (
    <VerticalGroup>
      <HorizontalGroup>
        <Label>Site</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.site })}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Device</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.device})}
          options={convertToSelectableValues(state.devices)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup>
      <HorizontalGroup>
        <Label>Metric</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.metric})}
          options={convertToSelectableValues(state.metrics)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Unit</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.unit})}
          options={convertToSelectableValues(state.units)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup>
      {/*
        <Label>Data Mode</Label>
        <Select
          value={({ value: props.query.site})}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup>
      */}
    </VerticalGroup>
  );
};
