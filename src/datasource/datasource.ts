import './kentik_proxy';
import { metricList, unitList, filterFieldList, Metric, Unit, FilterField } from './metric_def';
import queryBuilder from './query_builder';

import TableModel from 'grafana/app/core/table_model';

import * as _ from 'lodash';

class KentikDatasource {
  name: string;
  kentik: any;

  /** @ngInject */
  constructor(public instanceSettings: any, public templateSrv: any, kentikProxySrv: any) {
    this.name = instanceSettings.name;
    this.kentik = kentikProxySrv;
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

  async query(options: any) {
    if (!options.targets || options.targets.length === 0) {
      return Promise.resolve({ data: [] });
    }

    const customDimensions = await this.kentik.getCustomDimensions();
    const savedFiltersList = await this.kentik.getSavedFilters();
    const kentikFilters = this.templateSrv.getAdhocFilters(this.name);
    const allDevices = await this.kentik.getDevices();

    const promises = _.map(
      _.filter(options.targets, target => !target.hide),
      async (target, i) => {
        const site = this.templateSrv.replace(target.site, options.scopedVars);
        let deviceNames = this.templateSrv.replace(target.device, options.scopedVars, this.interpolateDeviceField.bind(this));
        // TODO: replace 'all' with null
        if (site && site !== 'all') {
          const filteredDevices = _.filter(deviceNames.split(','), deviceName => {
            const device = _.find(allDevices, d => d.device_name === deviceName);
            if (!device) {
              throw new Error(`Can't find device with name ${deviceName}`);
            }
            return device.site.site_name === site;
          });
          deviceNames = filteredDevices.join(',');
        }

        const queryCustomFilters = _.map(target.customFilters, filter => {
          return {
            condition: this.templateSrv.replace(filter.conjunctionOperator, options.scopedVars),
            key: this.templateSrv.replace(filter.keySegment?.value, options.scopedVars),
            operator: this.templateSrv.replace(filter.operatorSegment?.value, options.scopedVars),
            value: this.templateSrv.replace(filter.valueSegment?.value, options.scopedVars),
          };
        });
        const kentikFilterGroups = queryBuilder.convertToKentikFilterGroup(kentikFilters, customDimensions, savedFiltersList);
        const queryCustomFilterGroups = queryBuilder.convertToKentikFilterGroup(queryCustomFilters, customDimensions, savedFiltersList);
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
      const timeseries = _.find(series.timeSeries, serie => {
        return serie.flow && serie.flow.length;
      });

      const prefix = target.prefix ? `${target.prefix} ` : '';
      const seriesName = `${this.templateSrv.replace(prefix)}${series.key}`;

      if (timeseries) {
        const grafanaSeries = {
          target: seriesName,
          datapoints: _.map(timeseries.flow, point => {
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

    _.forEach(bucketData, row => {
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
          devices = _.filter(devices, device => device.site.site_name === site);
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
        res.splice(0, 0, { text: 'all', value: null });
        return res;
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
}

export { KentikDatasource };
