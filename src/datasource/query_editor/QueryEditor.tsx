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
    devices: [] as QueryItem[],
    sites: [] as QueryItem[],
    isLoading: true,
  });

  useEffect(() => {
    const init = async () => {
      const [devices, sites] = await Promise.all([fetchDevices(), fetchSites()]);

      setState({
        ...state,
        devices,
        sites,
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

  return (
    <VerticalGroup>
      <HorizontalGroup>
        <Label>Device</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.device})}
          options={convertToSelectableValues(state.devices)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Site</Label>
        <Select
          isLoading={state.isLoading}
          value={({ value: props.query.site})}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup>
      {/* <HorizontalGroup>
        <Label>Metric</Label>
        <Select
          value={({ value: props.query.device})}
          options={convertToSelectableValues(state.devices)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Unit</Label>
        <Select
          value={({ value: props.query.site})}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Data Mode</Label>
        <Select
          value={({ value: props.query.site})}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup>
      <HorizontalGroup>
        <Label>Device</Label>
        <Select
          value={({ value: props.query.device})}
          options={convertToSelectableValues(state.devices)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Site</Label>
        <Select
          value={({ value: props.query.site})}
          options={convertToSelectableValues(state.sites)}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
      </HorizontalGroup> */}
    </VerticalGroup>
  );
};
