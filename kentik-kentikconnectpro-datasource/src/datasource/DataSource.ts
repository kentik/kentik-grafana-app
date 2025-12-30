import queryBuilder from './query_builder';
import { dimensionList, metricList, filterFieldList, Dimension, Metric, FilterField, allMetricOptions } from './metric_def';
import { KentikAPI } from './kentik_api';
import { KentikProxy } from './kentik_proxy';
import { DataSourceInstanceSettings, DataSourceJsonData, DataSourceApi, AdHocVariableFilter, FieldType, DataQueryRequest, DataQueryResponse, TestDataSourceResponse, PartialDataFrame } from '@grafana/data';
import { getTemplateSrv, TemplateSrv, getBackendSrv } from '@grafana/runtime';

import * as _ from 'lodash';
import { CustomFilter, DEFAULT_QUERY, Query } from './QueryEditor';

export interface MyDataSourceOptions extends DataSourceJsonData { }
export const ALL_SITES_LABEL = 'All';

export class DataSource extends DataSourceApi<Query, MyDataSourceOptions> {
  datasourceType: string;
  kentik: any;
  templateSrv: TemplateSrv;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.datasourceType = instanceSettings.type;

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

  async query(options: DataQueryRequest<Query>): Promise<DataQueryResponse> {
    if (!options.targets || options.targets.length === 0) {
      return Promise.resolve({ data: [] });
    }
    if (options.panelPluginId === 'kentik-description-panel') {
      return Promise.resolve({ data: [] });
    }

    const customDimensions = await this.kentik.getCustomDimensions();
    const savedFiltersList = await this.kentik.getSavedFilters();
    const kentikFilters: AdHocVariableFilter[] = options.filters || [];

    const promises = _.map(
      _.filter(options.targets, (target) => !target.hide),
      async (target, i) => {
        _.defaults(target, DEFAULT_QUERY);
        const siteNames = target.sites?.map(site => site.label).toString();
        this.templateSrv.replace(siteNames, options.scopedVars);
        const deviceNames = this.templateSrv.replace(
          //@ts-ignore
          target.devices,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );
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
        //@ts-ignore
        const dimension = this.templateSrv.replace(target.dimension);
        const queryOptions = {
          deviceNames: _.isArray(deviceNames) ? deviceNames.map((device) => device.label).toString() : deviceNames,
          range: {
            from: options.range.from,
            to: options.range.to,
          },
          dimension: _.isArray(dimension) ? dimension.map((dimension) => dimension.value).toString() : dimension,
          metric: this.templateSrv.replace(target.metric),
          kentikFilterGroups: filters,
          kentikSavedFilters: kentikFilterGroups.savedFilters,
          hostnameLookup: this.templateSrv.replace(target.hostnameLookup),
          siteNames: siteNames,
          topx: target.topx,
        };
        const query = queryBuilder.buildTopXdataQuery(queryOptions);

        // table mode
        if (target.mode === 'table') {
          const topXData = await this.kentik.invokeTopXDataQuery(query);
          const processed = await this.processResponse(
            query,
            target.mode,
            target,
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
            { ...target, aggregate: singleAgg },
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
    const dimensionDef = _.find(extendedDimensionsList, { value: query.dimension[0] });

    if (!dimensionDef) {
      throw new Error('Query error: Dimension field is required');
    }

    const metricDef = _.find(metricList, { value: query.metric[0] });

    if (!metricDef) {
      throw new Error('Query error: Metric field is required');
    }

    if (mode === 'table') {
      return this.processTableData(bucketData, dimensionDef, metricDef);
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
    const aggName = query.aggregates[0].name || query.aggregateTypes[0];
    const { aliasBy, prefix = '' } = target;
  
    if (!aliasBy) {
      const alias = `${prefix} ${series.key} (${aggName})`;
      return this.templateSrv.replace(alias, target.scopedVars);
    }

    let alias = aliasBy;
    alias = aliasBy.replace(/\$tag_([a-zA-Z0-9_]+)/g, (match: string, tagName: string) => {
      if (!_.isNil(series[tagName])) {
        return series[tagName];
      }
      return match;
    });
  
    alias = alias.replace(/\$col/g, aggName);
    alias = this.templateSrv.replace(`${prefix} ${alias}`);
    return alias;
  }

  processTableData(bucketData: any[], dimensionDef: any, metricDef: any) {
    const dimensionColumn = {
      name: dimensionDef.text,
      type: FieldType.string,
      values: [] as any[],
    };

    const metricColumns = metricDef.tableFields.map((col: any) => ({
      name: col.text,
      type: FieldType.number,
      values: [] as number[],
      config: { unit: col.metric },
    }));

    _.forEach(bucketData, (row) => {
      const seriesName = row.key;
      dimensionColumn.values.push(seriesName);

      for (let i = 0; i < metricColumns.length; i++) {
        const col = metricDef.tableFields[i];
        let val = row[col.field];

        if (_.isString(val)) {
          val = parseFloat(val);
        }

        metricColumns[i].values.push(val);
      }
    });

    const frame: PartialDataFrame = {
      name: dimensionDef.text,
      fields: [dimensionColumn, ...metricColumns],
    };

    return frame;
  }

  private isAllSitesSelected(target: any) {
    return target.sites.map((site: any) => site.label).includes(ALL_SITES_LABEL);
  }

  async metricFindQuery(query: any, target: any) {
    switch (query) {
      case 'dimensions()': {
        return this._getExtendedDimensionList(dimensionList);
      }
      case 'metrics()': {
        return metricList;
      }
      case 'devices()': {
        let devices = await this.kentik.getDevices();
        if (!_.isEmpty(target.sites) && !this.isAllSitesSelected(target)) {
          const siteLabales = target.sites.map((site: any) => site.label);
          devices = _.filter(devices, (device) => siteLabales.includes(device.site.siteName));
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
    const savedFilters = await this.kentik.getSavedFilters();
    return _.concat(initialList, savedFilters);
  }

  async getTagValues(options: any) {
    if (options) {
      let filter = _.find<FilterField>(filterFieldList, { text: options.key });
      if (filter === undefined) {
        const savedFilters = await this.kentik.getSavedFilters();
        filter = _.find(savedFilters, { text: options.key });
        if (filter === undefined) {
          const customDimensions = await this.kentik.getCustomDimensions();
          const dimension: any = _.find(customDimensions, { text: options.key });
          return dimension.values.map((value: any) => ({ text: value }));
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
