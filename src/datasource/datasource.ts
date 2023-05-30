import queryBuilder from './query_builder';
import { metricList, unitList, filterFieldList, Metric, Unit, FilterField } from './metric_def';
import { KentikAPI } from './kentik_api';
import { KentikProxy } from './kentik_proxy';

import TableModel from 'grafana/app/core/table_model';

import {
  DataSourceApi,
  DataSourceInstanceSettings,
  DataQuery,
  DataSourceJsonData,
  DataQueryRequest,
  DataQueryResponse,
  VariableModel,
} from '@grafana/data';
import { getTemplateSrv, TemplateSrv, getBackendSrv } from '@grafana/runtime';

import * as _ from 'lodash';

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

export interface KentikQuery extends DataQuery {
  mode: DataMode;
  site: string;
  device: string | null;
  metric: string;
  unit: string;
  hostnameLookup: string;
  prefix: string;
  customFilters: CustomFilter[];
  // TODO: enum
  conjunctionOperator: ConjunctionOperator;
}

export const DEFAULT_QUERY = {
  mode: DataMode.GRAPH,
  site: null,
  device: null,
  metric: null,
  unit: null,
  hostnameLookup: null,
  prefix: '',
  customFilters: [],
  conjunctionOperator: ConjunctionOperator.AND,
};

export interface MyDataSourceOptions extends DataSourceJsonData {}

export class KentikDataSource extends DataSourceApi<KentikQuery, MyDataSourceOptions> {
  datasourceType: string;
  kentik: any;
  templateSrv: TemplateSrv;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.datasourceType = instanceSettings.type;

    // `arguments[1]` is a hack used by `datasource.test.ts`
    const kentikApi = new KentikAPI(arguments[1] || getBackendSrv());
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

  async query(options: DataQueryRequest<KentikQuery>): Promise<DataQueryResponse> {
    if (!options.targets || options.targets.length === 0) {
      return Promise.resolve({ data: [] });
    }

    const customDimensions = await this.kentik.getCustomDimensions();
    const savedFiltersList = await this.kentik.getSavedFilters();

    const templateSrv = getTemplateSrv();
    const kentikFilters: any[] = _.flatten(
      _.map(
        _.filter(
          templateSrv.getVariables(),
          // @ts-expect-error
          (variable: VariableModel) => variable.type === 'adhoc' && variable.datasource.type === this.datasourceType
        ),
        // @ts-expect-error
        (variable: VariableModel) => variable.filters
      )
    );

    const allDevices = await this.kentik.getDevices();

    const promises = _.map(
      _.filter(options.targets, (target) => !target.hide),
      async (target, i) => {
        _.defaults(target, DEFAULT_QUERY);
        const site = this.templateSrv.replace(target.site, options.scopedVars);
        let deviceNames = this.templateSrv.replace(
          target.device || undefined,
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );
        // TODO: replace 'all' with null
        if (site && site !== 'all') {
          const filteredDevices = _.filter(deviceNames.split(','), (deviceName) => {
            const device = _.find(allDevices, (d) => d.device_name === deviceName);
            if (!device) {
              throw new Error(`Can't find device with name ${deviceName}`);
            }
            return device.site.site_name === site;
          });
          deviceNames = filteredDevices.join(',');
        }

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
          metric: this.templateSrv.replace(target.metric),
          unit: this.templateSrv.replace(target.unit),
          kentikFilterGroups: filters,
          kentikSavedFilters: kentikFilterGroups.savedFilters,
          hostnameLookup: this.templateSrv.replace(target.hostnameLookup),
        };
        const query = queryBuilder.buildTopXdataQuery(queryOptions);

        const topXData = await this.kentik.invokeTopXDataQuery(query);
        const data = await this.processResponse(query, target.mode, target, topXData);
        return data;
      }
    );

    const results = await Promise.all(promises);

    return { data: _.flatten(results) };
  }

  async processResponse(query: any, mode: string, target: any, data: any) {
    if (!data.results) {
      return Promise.reject({ message: 'no kentik data' });
    }

    const bucketData = data.results[0].data;
    if (bucketData.length === 0) {
      return [];
    }

    const extendedMetricList = await this._getExtendedDimensionsList(metricList);
    const metricDef = _.find(extendedMetricList, { value: query.dimension[0] });

    if (!metricDef) {
      throw new Error('Query error: Metric field is required');
    }

    const unitDef = _.find(unitList, { value: query.metric });

    if (!unitDef) {
      throw new Error('Query error: Unit field is required');
    }

    if (mode === 'table') {
      return this.processTableData(bucketData, metricDef, unitDef);
    } else {
      return this.processTimeSeries(bucketData, query, target);
    }
  }

  processTimeSeries(bucketData: any, query: any, target: any) {
    const seriesList: any[] = [];
    let endIndex = query.topx;
    if (bucketData.length < endIndex) {
      endIndex = bucketData.length;
    }

    for (let i = 0; i < endIndex; i++) {
      const series = bucketData[i];
      const timeseries = _.find(series.timeSeries, (serie) => {
        return serie.flow && serie.flow.length;
      });

      const prefix = target.prefix ? `${target.prefix} ` : '';
      const seriesName = `${this.templateSrv.replace(prefix)}${series.key}`;

      if (timeseries) {
        const grafanaSeries = {
          target: seriesName,
          datapoints: _.map(timeseries.flow, (point) => {
            return [point[1], point[0]];
          }),
        };
        seriesList.push(grafanaSeries);
      }
    }

    return seriesList;
  }

  processTableData(bucketData: any, metricDef: any, unitDef: any) {
    const table = new TableModel();

    table.columns.push({ text: metricDef.text });

    for (const col of unitDef.tableFields) {
      table.columns.push({ text: col.text, unit: col.unit });
    }

    _.forEach(bucketData, (row) => {
      const seriesName = row.key;

      const values = [seriesName];
      for (const col of unitDef.tableFields) {
        let val = row[col.field];

        if (_.isString(val)) {
          val = parseFloat(val);
        }

        values.push(val);
      }

      table.rows.push(values);
    });

    return [table];
  }

  async metricFindQuery(query: any, target: any) {
    switch (query) {
      case 'metrics()': {
        return this._getExtendedDimensionsList(metricList);
      }
      case 'units()': {
        return unitList;
      }
      case 'devices()': {
        const site = this.templateSrv.replace(target.site);
        let devices = await this.kentik.getDevices();
        if (target.site && target.site !== 'all') {
          devices = _.filter(devices, (device) => device.site.site_name === site);
        }
        return devices.map((device: any) => {
          return { text: device.device_name, value: device.device_name };
        });
      }
      case 'sites()': {
        const sites = await this.kentik.getSites();
        const res = sites.map((site: any) => {
          return { text: site.site_name, value: site.site_name };
        });
        return [{ text: 'all', value: null }, ...res];
      }
      default:
        throw new Error(`Unknown query type: ${query}`);
    }
  }

  findMetric(query: { text?: string; value?: string }): Metric | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const metric = _.find<Metric>(metricList, query);
    if (metric === undefined) {
      return null;
    }

    return metric;
  }

  findUnit(query: { text?: string; value?: string }): Unit | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const unit = _.find<Unit>(unitList, query);
    if (unit === undefined) {
      return null;
    }

    return unit;
  }

  async getTagKeys() {
    const initialList = await this._getExtendedDimensionsList(filterFieldList);
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

  private async _getExtendedDimensionsList(list: any[]) {
    const customDimensions = await this.kentik.getCustomDimensions();
    return _.concat(list, customDimensions);
  }

  async testDatasource() {
    // TODO: implement testing
    return true;
  }
}
