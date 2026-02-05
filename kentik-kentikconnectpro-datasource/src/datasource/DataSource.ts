import queryBuilder from './query_builder';
import { dimensionList, metricNestedList, filterFieldList, Dimension, Metric, FilterField, allMetricOptions } from './metric_def';
import { KentikAPI } from './kentik_api';
import { KentikProxy } from './kentik_proxy';
import { DataSourceInstanceSettings, DataSourceJsonData, DataSourceApi, AdHocVariableFilter, FieldType, DataQueryRequest, DataQueryResponse, TestDataSourceResponse, PartialDataFrame } from '@grafana/data';
import { getTemplateSrv, TemplateSrv, getBackendSrv } from '@grafana/runtime';

import * as _ from 'lodash';
import { CustomFilter, DEFAULT_QUERY, Query } from './QueryEditor';

export interface MyDataSourceOptions extends DataSourceJsonData { }
export const ALL_SITES_LABEL = 'All';
export const KENTIK_DESCRIPTION_PANEL = 'kentik-description-panel';

export class DataSource extends DataSourceApi<Query, MyDataSourceOptions> {
  datasourceType: string;
  kentik: any;
  templateSrv: TemplateSrv;
  initialRun: boolean;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.datasourceType = instanceSettings.type;
    this.initialRun = true;

    // `arguments[1]` is a hack used by `datasource.test.ts`
    const kentikApi = new KentikAPI(arguments[1] || getBackendSrv(), instanceSettings.uid);
    this.kentik = new KentikProxy(kentikApi);
    this.templateSrv = getTemplateSrv();
  }

  interpolateDeviceField(value: any, variable: any) {
    // if no multi or include all do not regexEscape
    if (!variable.multi && !variable.includeAll) {
      return value;
    }

    if (typeof value === 'string') {
      return value;
    }

    return value.join(',');
  }

  private isQueryTargetEmpty = (target: any): boolean => {
    const targetObligatoryItems = ['sites', 'devices', 'dimension', 'metric'];

    const isTargetEmpty = targetObligatoryItems.some((item) => {
      const targetItem = target[item];

      if (targetItem === null || targetItem === undefined) {
        return true;
      }

      return Array.isArray(targetItem) && targetItem.length === 0;
    });

    return isTargetEmpty;
  }

  private isQueryTargetsEmpty = (options: DataQueryRequest<Query>): boolean => {
    const {targets} = options;

    if (!targets || targets.length === 0) {
      return true;
    }

    const areTargetsEmpty = targets.every((target) => this.isQueryTargetEmpty(target));

    return areTargetsEmpty;

  }

  async query(options: DataQueryRequest<Query>): Promise<DataQueryResponse> {
    if (this.initialRun === true && this.isQueryTargetsEmpty(options)) {
      this.initialRun = false;

      return Promise.resolve({data: []})
    }

    this.initialRun = false;

    if (!options.targets || options.targets.length === 0) {
      return Promise.resolve({ data: [] });
    }
    if (options.panelPluginId === KENTIK_DESCRIPTION_PANEL) {
      return Promise.resolve({ data: [] });
    }

    const customDimensions = await this.kentik.getCustomDimensions();
    const savedFiltersList = await this.kentik.getSavedFilters();
    const kentikFilters: AdHocVariableFilter[] = options.filters || [];

    const promises = _.map(
      _.filter(options.targets, (target) => !target.hide),
      async (target, i) => {
        _.defaults(target, DEFAULT_QUERY);

        const siteNames = typeof target.sites === 'string' ? this.templateSrv.replace(
          target.sites,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        ) : target.sites?.map(site => site.label).toString();

        const deviceNames = typeof target.devices === 'string' ? this.templateSrv.replace(
          target.devices,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        ) : target.devices?.map(device => device.label).toString();

        const dimensionsNames = typeof target.dimension === 'string' ? this.templateSrv.replace(
          target.dimension,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        ) : target.dimension?.map(d => d.value).toString();

        const metricsNames = typeof target.metric === 'string' ? this.templateSrv.replace(
          target.metric,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        ) : target.metric?.map(m => m.value).toString();

        const queryCustomFilters = _.map(
          _.filter(
            target.customFilters,
            (filter: CustomFilter) => filter.keySegment !== null && filter.valueSegment !== null
          ),
          (filter: CustomFilter) => {
            return {
              condition: this.templateSrv.replace(filter.conjunctionOperator, options.scopedVars),
              key: this.templateSrv.replace(filter.keySegment || undefined, options.scopedVars),
              operator: this.templateSrv.replace(filter.operatorSegment, options.scopedVars),
              value: this.templateSrv.replace(filter.valueSegment || undefined, options.scopedVars),
            };
          }
        );
        const kentikFilterGroups = queryBuilder.convertToKentikFilterGroup(
          kentikFilters,
          customDimensions,
          savedFiltersList
        );
        const queryCustomFilterGroups = queryBuilder.convertToKentikFilterGroup(
          queryCustomFilters,
          customDimensions,
          savedFiltersList
        );
        const filters = [...kentikFilterGroups.kentikFilters, ...queryCustomFilterGroups.kentikFilters];

        const queryOptions = {
          deviceNames: deviceNames,
          range: {
            from: options.range.from,
            to: options.range.to,
          },
          dimension: dimensionsNames,
          metric: metricsNames,
          kentikFilterGroups: filters,
          kentikSavedFilters: kentikFilterGroups.savedFilters,
          hostnameLookup: this.templateSrv.replace(target.hostnameLookup),
          siteNames: siteNames,
          topx: target.topx,
        };

        let query = queryBuilder.buildTopXdataQuery(queryOptions, options.panelPluginId);;

        // table mode
        if (target.mode === 'table') {
          const topXData = await this.kentik.invokeTopXDataQuery(query);
          const processed = await this.processResponse(
            query,
            target.mode,
            { ...target, scopedVars: options.scopedVars },
            topXData.data,
            topXData.url
          );

          return processed;
        }

        // graph mode
        const allAggResults: any[] = [];

        for (const singleAgg of query.aggregates) {
          const perAggQuery = {
            ...query,
            aggregates: [singleAgg],
            aggregateTypes: [singleAgg.name],
            outsort: singleAgg.name,
          };

          const topXData = await this.kentik.invokeTopXDataQuery(perAggQuery);
          const processed = await this.processResponse(
            perAggQuery,
            target.mode,
            { ...target, aggregate: singleAgg, scopedVars: options.scopedVars },
            topXData.data,
            topXData.url
          );

          allAggResults.push(processed);
        }

        return _.flatten(allAggResults);

      }
    );

    const results = await Promise.all(promises);
    return { data: _.flatten(results) };
  };

  async processResponse(query: any, mode: string, target: any, data: any, drilldownUrl: string) {
    if (!data.results) {
      return Promise.reject({ message: 'no kentik data' });
    }

    const bucketData = data.results[0].data;
    if (bucketData.length === 0) {
      return [];
    }

    const extendedDimensionsList = await this._getExtendedDimensionList(dimensionList);
    const dimensionDefs = _.filter(
      extendedDimensionsList,
      item => query.dimension?.includes(item.value)
    );

    if (_.isEmpty(dimensionDefs)) {
      throw new Error('Query error: Dimension field is required');
    }

    const metricDefs = allMetricOptions.filter(opt => query.aggregateTypes?.includes(opt.value));;

    if (!metricDefs) {
      throw new Error('Query error: Metric field is required');
    }

    if (mode === 'table') {
      return this.processTableData(bucketData, dimensionDefs, metricDefs);
    } else {
      return this.processTimeSeries(bucketData, query, target, drilldownUrl);
    }
  }

  processTimeSeries(bucketData: any, query: any, target: any, drilldownUrl: string) {
    const frames: PartialDataFrame[] = [];

    let endIndex = query.topx;
    if (bucketData.length < endIndex) {
      endIndex = bucketData.length;
    }

    for (let i = 0; i < endIndex; i++) {
      const series = bucketData[i];

      const timeseries = _.find(series.timeSeries, (serie) => {
        return serie.flow && serie.flow.length;
      });

      const seriesName = this.applyAliasPattern(series, query, target);

      if (timeseries) {
        const frame: PartialDataFrame = {
          fields: [
            {
              name: 'time',
              type: FieldType.time,
              values: _.map(timeseries.flow, (p) => p[0]),
            },
            {
              name: seriesName,
              type: FieldType.number,
              values: _.map(timeseries.flow, (p) => p[1]),
              config: {
                links: [
                  {
                    title: 'Open in Kentik',
                    url: drilldownUrl,
                    targetBlank: true,
                  },
                ],
              },
            },
          ],
        };

        frames.push(frame);
      }
    }

    return frames;
  }

  applyAliasPattern(series: any, query: any, target: any): string {
    const aggName = query.aggregates[0]?.name || query.aggregateTypes?.[0] || '';
    const { aliasBy, prefix = '' } = target;

    const replaceTag = (match: string, tagName: string) => {
      // Find dimension if tagName is a label or an ID
      const dim = dimensionList.find(
        (d) =>
          d.text.toLowerCase() === tagName.toLowerCase() ||
          d.value.toLowerCase() === tagName.toLowerCase() ||
          d.field.toLowerCase() === tagName.toLowerCase()
      );
      const effectiveTagName = dim ? dim.field : tagName;

      // 1. Try exact match on series property (using original tagName or effective ID)
      if (!_.isNil(series[tagName])) {
        return series[tagName];
      }
      if (effectiveTagName !== tagName && !_.isNil(series[effectiveTagName])) {
        return series[effectiveTagName];
      }

      // 2. Try case-insensitive match on series properties for both names
      const foundKey = Object.keys(series).find(
        (key) => key.toLowerCase() === tagName.toLowerCase() || key.toLowerCase() === effectiveTagName.toLowerCase()
      );
      if (foundKey && !_.isNil(series[foundKey])) {
        return series[foundKey];
      }

      // 3. Try extracting from series.key by dimension index (common for TopX)
      if (query.dimension && Array.isArray(query.dimension)) {
        const dimIndex = query.dimension.findIndex(
          (d: string) => d.toLowerCase() === tagName.toLowerCase() || d.toLowerCase() === effectiveTagName.toLowerCase()
        );
        if (dimIndex !== -1 && series.key) {
          const keyParts = series.key.split(',');
          if (keyParts.length > dimIndex) {
            return keyParts[dimIndex];
          }
        }
      }

      return match;
    };

    let result = '';
    if (!aliasBy) {
      const seriesKey = series.key || '';
      const suffix = aggName ? ` (${aggName})` : '';
      result = `${prefix} ${seriesKey}${suffix}`;
    } else {
      result = `${prefix} ${aliasBy}`;
    }

    // Apply substitutions to the entire resulting string
    // $tag_ is restricted to non-whitespace to avoid greediness
    // {{...}} supports spaces/dashes as it is explicitly delimited
    result = result.replace(/\$tag_([a-zA-Z0-9_\.]+)/g, replaceTag);
    result = result.replace(/\{\{([a-zA-Z0-9_\.\s\-]+)\}\}/g, replaceTag);
    result = result.replace(/\$col/g, aggName);

    return this.templateSrv.replace(result, target.scopedVars);
  }

  inferMetricFromUnit(unit: string): 'bps' | 'pps' | 'fps' | 'none' {
    switch (unit) {
      case 'bytes': return 'bps';
      case 'packets': return 'pps';
      case 'fps': return 'fps';
      default: return 'none';
    }
  }

  processTableData(bucketData: any[], dimensionDefs: any[], metricDefs: any[]) {
    const seriesColumn = {
      name: 'Series name',
      type: FieldType.string,
      values: [] as string[],
    };

    const dimensionColumn = {
      name: 'Dimension',
      type: FieldType.string,
      values: [] as string[],
    };
  
    const metricColumns = metricDefs.map((def: Metric) => ({
      name: def.value,
      type: FieldType.number,
      values: [] as number[],
      config: { unit: this.inferMetricFromUnit(def.unit) },
    }));
  
    const allDimensionNames = dimensionDefs.map(d => d.text).join(', ');
  
    _.forEach(bucketData, (row) => {
      seriesColumn.values.push(row.key);
      dimensionColumn.values.push(allDimensionNames); 
  
      metricDefs.forEach((metricDef, i) => {
        let val = row[metricDef.value];
        if (_.isString(val)) {
          val = parseFloat(val);
        }
        metricColumns[i].values.push(val);
      });
    });
  
    const frame: PartialDataFrame = {
      name: 'Series by Dimension',
      fields: [
        seriesColumn,
        dimensionColumn,
        ...metricColumns,
      ],
    };

    return frame;
  }

  private isAllSitesSelected(target: any) {
    return target.sites.map((site: any) => site.label)?.includes(ALL_SITES_LABEL);
  }

  async metricFindQuery(query: any, target: any) {
    switch (query) {
      case 'dimensions()': {
        const result = await this._getExtendedDimensionList(dimensionList);
        return result;
      }
      case 'metrics()': {
        return metricNestedList;
      }
      case 'metricsOptions()': {
        return allMetricOptions;
      }
      case 'devices()': {
        let devices = await this.kentik.getDevices();
        if (!_.isEmpty(target.sites) && !this.isAllSitesSelected(target)) {
          const siteLabales = target.sites.map((site: any) => site.label);
          devices = _.filter(devices, (device) => siteLabales?.includes(device.site.siteName));
        }
        return devices.map((device: any) => {
          return { text: device.deviceName, value: device.deviceName };
        });
      }
      case 'sites()': {
        const sites = await this.kentik.getSites();
        const res = sites.map((site: any) => {
          return { text: site.title, value: site.title };
        });
        return [{ text: ALL_SITES_LABEL, value: null }, ...res];
      }
      default:
        throw new Error(`Unknown query type: ${query}`);
    }
  }

  findDimension(query: { text?: string; value?: string }): Dimension | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const dimension = _.find<Dimension>(dimensionList, query);
    if (dimension === undefined) {
      return null;
    }

    return dimension;
  }

  findMetric(query: { text?: string; value?: string }): Metric | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const metric = _.find<Metric>(allMetricOptions, query);
    if (metric === undefined) {
      return null;
    }

    return metric;
  }

  async getTagKeys() {
    const initialList = await this._getExtendedDimensionList(filterFieldList);
    const savedFiltersResp = await this.kentik.getSavedFilters();
    const savedFilters = savedFiltersResp.filters || savedFiltersResp;
    return _.concat(initialList, Array.isArray(savedFilters) ? savedFilters : []);
  }

  async getTagValues(options: any) {
    if (options) {
      let filter = _.find<FilterField>(filterFieldList, { text: options.key });
      if (filter === undefined) {
        const savedFiltersResp = await this.kentik.getSavedFilters();
        const savedFilters = savedFiltersResp.filters || savedFiltersResp;
        filter = _.find(Array.isArray(savedFilters) ? savedFilters : [], { text: options.key });
        if (filter === undefined) {
          const customDimensions = await this.kentik.getCustomDimensions();
          const dimension: any = _.find(customDimensions, { text: options.key });
          if (dimension && dimension.values) {
            return dimension.values.map((value: any) => ({ text: value }));
          }
          return [];
        } else {
          return [{ text: 'include' }, { text: 'exclude' }];
        }
      } else {
        const field = filter.field;
        const result = await this.kentik.getFieldValues(field);
        return result.rows.map((row: any) => {
          return { text: row[field].toString() };
        });
      }
    } else {
      return [];
    }
  }

  async getCustomDimensions() {
    const customDimensions = await this.kentik.getCustomDimensions();

    const comboboxCustomDimensionOptions = customDimensions.map((customDimension: { text: string, value: string, field: string }) => {
      return {
        label: customDimension.text,
        value: `$${customDimension.field}`,
        originalValue: customDimension.field
      };
    })

    return comboboxCustomDimensionOptions;
  }

  private async _getExtendedDimensionList(list: any[]) {
    const customDimensions = await this.kentik.getCustomDimensions();
    return _.concat(list, customDimensions);
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    // TODO: implement testing
    return {
      status: '',
      message: ''
    }
  }
}
