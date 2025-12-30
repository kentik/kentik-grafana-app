import { ALL_SITES_LABEL } from './DataSource';
import { metricList, filterFieldList, Metric, FilterField, allMetricOptions } from './metric_def';

import * as _ from 'lodash';

const KENTIK_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function formatMetricAggs(metricDef: any) {
  const aggs = [
    {
      name: 'avg_both',
      column: metricDef.field,
      fn: 'average',
      raw: true, // Set to get timeseries data
      sample_rate: 1,
    },
    {
      name: 'p95th_both',
      column: metricDef.field,
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
    {
      name: 'max_both',
      column: metricDef.field,
      fn: 'max',
      sample_rate: 1,
    },
  ];

  return aggs;
}

function formatUniqueIpAggs(metricDef: any) {
  const aggs = [
    {
      name: 'avg_ips',
      column: metricDef.field,
      fn: 'average',
      raw: true,
      sample_rate: 1,
    },
    {
      name: 'p95th_ips',
      column: metricDef.field,
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
    {
      name: 'max_ips',
      column: metricDef.field,
      fn: 'max',
      sample_rate: 1,
      raw: true,
    },
    {
      name: 'p95th_bits_per_sec',
      column: 'f_sum_both_bytes',
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
    {
      name: 'p95th_pkts_per_sec',
      column: 'f_sum_both_pkts',
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
  ];

  return aggs;
}

function formatAggs(metricDef: any) {
  let aggs: any[] = [];
  if (metricDef.value === 'unique_src_ip' || metricDef.value === 'unique_dst_ip') {
    aggs = formatUniqueIpAggs(metricDef);
  } else {
    aggs = formatMetricAggs(metricDef);
  }

  return aggs;
}

function formatFilters(kentikFilterGroups: any[]) {
  const filtersObj = {
    connector: 'All',
    filterGroups: [] as any[],
  };

  if (kentikFilterGroups.length) {
    filtersObj.filterGroups = kentikFilterGroups;
  }

  return filtersObj;
}

function buildTopXdataQuery(options: any) {
  const metricDef = allMetricOptions.find(opt =>
    options.metric.some((metric: any) => metric.value === opt.value)
  );
  if (!metricDef) {
    throw new Error('Query error: Metric field is required');
  }
  const startingTime = options.range.from.utc().format(KENTIK_TIME_FORMAT);
  const endingTime = options.range.to.utc().format(KENTIK_TIME_FORMAT);
  const isAllSitesSelected = options.siteNames?.split(',').includes(ALL_SITES_LABEL) || _.isEmpty(options.siteNames);

  const query = {
    dimension: options.dimension?.split(','),
    metric: _.uniq(options.metric.map((m: any) => m.unit)),
    matrixBy: [],
    cidr: 32,
    cidr6: 128,
    topx: options.topx,
    depth: 100,
    fastData: 'Auto',
    lookback_seconds: 0,
    time_format: 'UTC',
    starting_time: startingTime,
    ending_time: endingTime,
    device_name: options.deviceNames?.split(','),
    // outsort: metricDef!.outsort,
    outsort: "avg_both",
    aggregates: formatAggs(metricDef),
    filters_obj: formatFilters(options.kentikFilterGroups),
    saved_filters: options.kentikSavedFilters,
    hostname_lookup: options.hostnameLookup,
    device_site: isAllSitesSelected ? null : options.siteNames.split(','),
    aggregateTypes: formatAggs(metricDef).map((agg: any) => agg.name),
  };

  return query;
}

function convertToKentikFilter(filterObj: any, filterDef: FilterField) {
  let kentikOperator = filterObj.operator;

  // some filters don't support `=` operator
  // so we use `ILIKE` instead
  if (filterDef.unequatable) {
    if (kentikOperator === '=') {
      kentikOperator = 'ILIKE';
    }
  }

  // Use Kentik 'not equal' style
  if (kentikOperator === '!=') {
    kentikOperator = '<>';
  }

  return {
    filterField: filterDef.field,
    operator: kentikOperator,
    filterValue: filterObj.value,
  };
}

function convertToKentikSavedFilter(filterObj: any, filterDef: any) {
  return {
    filter_id: filterDef.id,
    is_not: filterObj.value === 'exclude',
  };
}

function convertToKentikFilterGroup(filters: any[], customDimensions: any[], savedFiltersList: any[]) {
  let kentikFilters: any[] = [];
  const savedFilters: any[] = [];

  if (filters.length) {
    const filterFieldListExtended = _.concat(filterFieldList, customDimensions);
    for (const filter of filters) {
      const filterFieldDef = _.find<FilterField>(filterFieldListExtended, { text: filter.key });
      if (filterFieldDef === undefined) {
        const savedFilterDef = _.find(savedFiltersList, { text: filter.key });
        savedFilters.push(convertToKentikSavedFilter(filter, savedFilterDef));
      } else {
        kentikFilters.push(convertToKentikFilter(filter, filterFieldDef));
      }
    }

    if (kentikFilters.length > 0) {
      let connector = 'All';
      if (
        filters[0].condition &&
        (filters[0].condition.toLowerCase() === 'or' || filters[0].condition.toLowerCase() === 'any')
      ) {
        connector = 'Any';
      }

      kentikFilters = [
        {
          connector,
          filters: kentikFilters,
          not: false,
        },
      ];
    }
  }

  return {
    kentikFilters,
    savedFilters,
  };
}

export default {
  buildTopXdataQuery,
  formatAggs,
  convertToKentikFilterGroup,
};
