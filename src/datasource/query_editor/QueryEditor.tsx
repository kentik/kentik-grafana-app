import React, { useState } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { KentikDataSource, KentikQuery } from '../new_datasource';
import { VerticalGroup, HorizontalGroup, Label, AsyncSelect } from '@grafana/ui';
import _ from 'lodash';

type MyDataSourceOptions = {}; 
type Props = QueryEditorProps<KentikDataSource, KentikQuery, MyDataSourceOptions>;

export type QueryItem = {
  value: string;
  text: string;
}

export const QueryEditor: React.FC<Props> = (props: Props) => {
  console.log('props', props);
  const [state] = useState({
    devices: [] as QueryItem[],
    sites: [] as QueryItem[],
  });

  // useEffect(() => {
  //   console.log('zalupa');
  //   fetchDevices();
  //   fetchSites();
  // }, []);

  const convertToSelectableValues = (items: QueryItem[]): SelectableValue<string>[] => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  }

  // const fetchDevices = async (): Promise<void> => {
  //   console.log('fetchDevices', state)
  //   const devices = await props.datasource.metricFindQuery('devices()', props.query);
  //   console.log('devices', state, devices)
  //   setState({
  //     ...state,
  //     devices,
  //   });
  // }

  // const fetchSites = async (): Promise<void> => {
  //   console.log('fetchSites', state)
  //   const sites = await props.datasource.metricFindQuery('sites()', props.query);
  //   console.log('sites', state, sites)
  //   setState({
  //     ...state,
  //     sites,
  //   });
  // }

  const getDevicesValues = async (): Promise<SelectableValue<string>[]> => {
    console.log('fetchDevices', state)
    const devices = await props.datasource.metricFindQuery('devices()', props.query);
    console.log('devices', state, devices)
    return convertToSelectableValues(devices);
  }

  const getSitesValues = async (): Promise<SelectableValue<string>[]> => {
    console.log('get sites', state)
    const sites = await props.datasource.metricFindQuery('sites()', props.query);
    console.log('sites', state, sites)
    return convertToSelectableValues(sites);
  }

  console.log('render', state.sites, state.devices)
  return (
    <VerticalGroup>
      <HorizontalGroup>
        <Label>Device</Label>
        <AsyncSelect
          value={({ value: props.query.device})}
          loadOptions={getDevicesValues}
          defaultOptions={true}
          width={20}
          onChange={(e) => props.onChange({ ...props.query })}
        />
        <Label>Site</Label>
        <AsyncSelect
          value={({ value: props.query.site})}
          loadOptions={getSitesValues}
          defaultOptions={true}
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
