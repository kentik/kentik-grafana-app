import { DEFAULT_QUERY, KentikDataSource, KentikQuery, CustomFilter } from '../new_datasource';

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

  const convertToSelectableValues = (items: QueryItem[]): Array<SelectableValue<string>> => {
    return _.map(items, (item: QueryItem) => ({ value: item.value, label: item.text }));
  };

  const getOperators = (): Array<SelectableValue<string>> => {
    const operators = ['=', '!=', '<', '<=', '>', '>='];
    const operatorItems = operators.map((o: string) => ({ value: o, text: o }));
    return convertToSelectableValues(operatorItems);
  }

  const [state, setState] = useState({
    sites: [] as Array<SelectableValue<string>>,
    devices: [] as Array<SelectableValue<string>>,
    metrics: [] as Array<SelectableValue<string>>,
    units: [] as Array<SelectableValue<string>>,
    tagKeys: [] as Array<SelectableValue<string>>,
    tagValues: [] as Array<Array<SelectableValue<string>>>,
    operators: getOperators(),
    isLoading: true,
    isTagKeysLoading: true,
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
      });
    };
    init();
    // eslint-disable-next-line
  }, []);

  const variableExists = (variableName: string): boolean => {
    const templateSrv = getTemplateSrv();
    const variables = templateSrv.getVariables().map((variable: VariableModel) => `$${variable.name}`);
    return _.includes(variables, variableName);
  };

  const getOptions = async (query: string, variableName?: string): Promise<Array<SelectableValue<string>>> => {
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

  const fetchSites = async (): Promise<Array<SelectableValue<string>>> => {
    return getOptions('sites()');
  };

  const fetchDevices = async (): Promise<Array<SelectableValue<string>>> => {
    return getOptions('devices()', '$device');
  };

  const fetchMetrics = async (): Promise<Array<SelectableValue<string>>> => {
    return getOptions('metrics()', '$metric');
  };

  const fetchUnits = async (): Promise<Array<SelectableValue<string>>> => {
    return getOptions('units()', '$unit');
  };

  const fetchTagKeys = async (): Promise<Array<SelectableValue<string>>> => {
    const keys: Array<{ text: string, field: string }> = await props.datasource.getTagKeys();
    const items: QueryItem[] = keys.map(key => ({ value: key.text, text: key.text }))
    return convertToSelectableValues(items);
  };

  const fetchTagValues = async (keySegment: string) => {
    const values: QueryItem[] = await props.datasource.getTagValues(
      { key: keySegment }
    );
    const items: QueryItem[] = values.map(value => ({ value: value.text, text: value.text }))
    return convertToSelectableValues(items);
  };

  const onOptionSelect = (field: keyof KentikQuery, option: SelectableValue<string>) => {
    props.onChange({ ...props.query, [field]: option.value });
    props.onRunQuery();
  }

  const onFilterOptionSelect = async (field: keyof CustomFilter, option: SelectableValue<string | null>, filterIdx: number) => {
    if(_.isNil(option.value)) {
      return;
    }
    const customFilters = _.cloneDeep(props.query.customFilters);
    customFilters[filterIdx][field] = option.value;
    if(field === 'keySegment') {
      customFilters[filterIdx].valueSegment = null;
    }
    props.onChange({ ...props.query, customFilters });
    if(field === 'keySegment') {
      const tagValues = await fetchTagValues(customFilters[filterIdx].keySegment as string);
      const stateValues = _.cloneDeep(state.tagValues);
      stateValues[filterIdx] = tagValues;
      setState({
        ...state,
        tagValues: stateValues,
      });
    }
  }

  const onAddFilterButtonClick = () => {
    const defaultFilter: CustomFilter = {
      keySegment: null, operatorSegment: '=', valueSegment: null, conjunctionOperator: 'AND'
    };
    props.onChange({ ...props.query, customFilters: [...props.query.customFilters, defaultFilter]});
  }

  const onDeleteFilterButtonClick = (filterIdx: number) => {
    props.onChange({
      ...props.query, customFilters: props.query.customFilters.filter((filter: any, idx: number) => idx !== filterIdx)
    })
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
          <Button size="sm" icon="plus" variant="secondary" onClick={onAddFilterButtonClick}></Button>
        </Field>
      </HorizontalGroup>
      {props.query.customFilters.map((filter: CustomFilter, filterIdx: number) =>
        <HorizontalGroup key={`custom-filter-row-${filterIdx}`}>
          <Select
            value={filter.keySegment}
            options={state.tagKeys}
            width={20}
            onChange={(option) => onFilterOptionSelect('keySegment', option, filterIdx)}
          />
          {!_.isNil(filter.keySegment) && (
            <HorizontalGroup>
              <Select
                value={filter.operatorSegment}
                options={state.operators}
                width={20}
                onChange={(option) => onFilterOptionSelect('operatorSegment', option, filterIdx)}
              />

              <Select
                value={filter.valueSegment}
                options={state.tagValues[filterIdx]}
                // TODO: add isLoading
                width={20}
                onChange={(option) => onFilterOptionSelect('valueSegment', option, filterIdx)}
              />
            </HorizontalGroup>
          )}
          <Button size="sm" icon="trash-alt" variant="secondary" onClick={() => onDeleteFilterButtonClick(filterIdx)}></Button>
        </HorizontalGroup>
      )}
    </VerticalGroup>
  );
};
