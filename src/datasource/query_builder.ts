import { unitList, filterFieldList, Unit, FilterField } from './metric_def';

import * as _ from 'lodash';


const KENTIK_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function formatMetricAggs(unitDef: any) {
  const aggs = [
    {
      name: 'avg_both',
      column: unitDef.field,
      fn: 'average',
      raw: true, // Set to get timeseries data
      sample_rate: 1,
    },
    {
      name: 'p95th_both',
      column: unitDef.field,
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
    {
      name: 'max_both',
      column: unitDef.field,
      fn: 'max',
      sample_rate: 1,
    },
  ];

  return aggs;
}

function formatUniqueIpAggs(unitDef: any) {
  const aggs = [
    {
      name: 'avg_ips',
      column: unitDef.field,
      fn: 'average',
      raw: true,
      sample_rate: 1,
    },
    {
      name: 'p95th_ips',
      column: unitDef.field,
      fn: 'percentile',
      rank: 95,
      sample_rate: 1,
    },
    {
      name: 'max_ips',
      column: unitDef.field,
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

function formatAggs(unitDef: any) {
  let aggs: any[] = [];
  if (unitDef.value === 'unique_src_ip' || unitDef.value === 'unique_dst_ip') {
    aggs = formatUniqueIpAggs(unitDef);
  } else {
    aggs = formatMetricAggs(unitDef);
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
  const unitDef = _.find<Unit>(unitList, { value: options.unit });
  const startingTime = options.range.from.utc().format(KENTIK_TIME_FORMAT);
  const endingTime = options.range.to.utc().format(KENTIK_TIME_FORMAT);

  const query = {
    dimension: [options.metric],
    metric: options.unit,
    matrixBy: [],
    cidr: 32,
    cidr6: 128,
    topx: '8', // Visualization depth (8 by default)
    depth: 100,
    fastData: 'Auto',
    lookback_seconds: 0,
    time_format: 'UTC',
    starting_time: startingTime,
    ending_time: endingTime,
    device_name: options.deviceNames,
    outsort: unitDef!.outsort,
    aggregates: formatAggs(unitDef),
    filters_obj: formatFilters(options.kentikFilterGroups),
    saved_filters: options.kentikSavedFilters,
    hostname_lookup: options.hostnameLookup,
  };

  return query;
}

function convertToKentikFilter(filterObj: any, filterDef: any) {
  // Use Kentik 'not equal' style
  if (filterObj.operator === '!=') {
    filterObj.operator = '<>';
  }

  return {
    filterField: filterDef.field,
    operator: filterObj.operator,
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
      if (filters[0].condition && (filters[0].condition.toLowerCase() === 'or' || filters[0].condition.toLowerCase() === 'any')) {
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
