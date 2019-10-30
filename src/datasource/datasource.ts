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

    const target = options.targets[0];
    const deviceNames = this.templateSrv.replace(target.device, options.scopedVars, this.interpolateDeviceField.bind(this));

    const kentikFilters = this.templateSrv.getAdhocFilters(this.name);
    const customDimensions = await this.kentik.getCustomDimensions();
    const savedFiltersList = await this.kentik.getSavedFilters();
    const kentikFilterGroups = queryBuilder.convertToKentikFilterGroup(kentikFilters, customDimensions, savedFiltersList);

    const queryOptions = {
      deviceNames: deviceNames,
      range: {
        from: options.range.from,
        to: options.range.to,
      },
      metric: this.templateSrv.replace(target.metric),
      unit: this.templateSrv.replace(target.unit),
      kentikFilterGroups: kentikFilterGroups.kentikFilters,
      kentikSavedFilters: kentikFilterGroups.savedFilters,
      hostnameLookup: this.templateSrv.replace(target.hostnameLookup),
    };
    const query = queryBuilder.buildTopXdataQuery(queryOptions);

    return this.kentik
      .invokeTopXDataQuery(query)
      .then(this.processResponse.bind(this, query, target.mode, options))
      .then((result: any) => {
        return {
          data: result,
        };
      });
  }

  async processResponse(query: any, mode: string, options: any, data: any) {
    if (!data.results) {
      return Promise.reject({ message: 'no kentik data' });
    }

    const bucketData = data.results[0].data;
    if (bucketData.length === 0) {
      return [];
    }

    const extendedMetricList = await this._getExtendedDimensionsList(metricList);
    const metricDef = _.find(extendedMetricList, { value: query.dimension[0] });

    const unitDef = _.find(unitList, { value: query.metric });

    if (mode === 'table') {
      return this.processTableData(bucketData, metricDef, unitDef);
    } else {
      return this.processTimeSeries(bucketData, query);
    }
  }

  processTimeSeries(bucketData: any, query: any) {
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
      const seriesName = series.key;

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

  async metricFindQuery(query: any) {
    if (query === 'metrics()') {
      return this._getExtendedDimensionsList(metricList);
    }
    if (query === 'units()') {
      return unitList;
    }

    return this.kentik.getDevices().then((devices: any) => {
      return devices.map((device: any) => {
        return { text: device.device_name, value: device.device_name };
      });
    });
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
        return this.kentik.getFieldValues(field).then((result: any) => {
          return result.rows.map((row: any) => {
            return { text: row[field].toString() };
          });
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
