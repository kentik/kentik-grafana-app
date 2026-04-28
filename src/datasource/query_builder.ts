import { ALL_DEVICES_LABEL, ALL_SITES_LABEL } from './DataSource';
import { filterFieldList, FilterField, allMetricOptions, dimensionList } from './metric_def';
import { DimensionCategory } from './metric_types';

import * as _ from 'lodash';

const KENTIK_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

// ── SNMP / NMS query routing helpers ─────────────────────────────────────────
//
// SNMP and Streaming Telemetry metrics live in "full-data" KDE partitions,
// not the fast-data partition used for standard flow.  The Kentik topXdata API
// uses different prefixes for different metric categories:
//
//   • SNMP Interface  → ktappprotocol__snmp__            (short form)
//   • SNMP Device     → ktappprotocol__snmp_device_metrics__  (long form)
//   • ST Interface    → ktappprotocol__st__              (short form)
//
// Key requirements for NMS/SNMP queries:
//   • fastData must be 'Full'
//   • app_protocol is NOT sent (the API routes on the prefix alone)
//
// SNMP/ST metrics were migrated from ktsubtype__ to ktappprotocol__.
// The query builder normalises the old prefix at query time so dashboards
// saved with a prior plugin version continue to work.

/** Prefixes that identify an NMS/SNMP metric in the wire format. */
const NMS_METRIC_PREFIXES = [
  'ktappprotocol__snmp_device_metrics__',
  'ktappprotocol__snmp__',
  'ktappprotocol__st__',
];

/**
 * Normalise a metric/dimension identifier for the Kentik API wire format.
 *
 * SNMP/ST metrics were migrated from ktsubtype__ to ktappprotocol__ in
 * metric_def.ts. Dashboards saved with a prior plugin version will still
 * carry the old prefix in their query JSON. This rewrites them at query
 * time so those dashboards continue to work after upgrade:
 *   • ktsubtype__snmp_device_metrics__    → ktappprotocol__snmp_device_metrics__
 *   • ktsubtype__snmp_interface_metrics__ → ktappprotocol__snmp__
 *   • ktsubtype__st_interface_metrics__   → ktappprotocol__st__
 *
 * Non-SNMP dimensions (AWS, Azure, GCP, OCI, etc.) still use ktsubtype__
 * natively and are not affected by this migration.
 * Standard flow values (`bytes`, `packets`, …) pass through unchanged.
 */
function normaliseKtPrefix(s: string): string {
  return s
    .replace(/ktsubtype__snmp_interface_metrics__/g, 'ktappprotocol__snmp__')
    .replace(/ktsubtype__st_interface_metrics__/g, 'ktappprotocol__st__')
    .replace(/ktsubtype__snmp_device_metrics__/g, 'ktappprotocol__snmp_device_metrics__');
}

/**
 * Return true if any of the selected metric definitions represent an NMS/SNMP
 * query (as opposed to standard flow).  Used to set `fastData: 'Full'`.
 */
function isNmsMetric(metricDefs: any[]): boolean {
  for (const metric of metricDefs) {
    const col: string = metric.unit || metric.value || '';
    if (NMS_METRIC_PREFIXES.some(prefix => col.startsWith(prefix))) {
      return true;
    }
  }
  return false;
}

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

function buildTopXdataQuery(options: any, panelId?: string) {
  // Normalise SNMP/ST metrics that still carry the pre-migration ktsubtype__
  // prefix (e.g. dashboards saved with a prior plugin version).
  const metricArray = options.metric?.split(',').map(normaliseKtPrefix);
  const metricDefs = allMetricOptions.filter(opt => metricArray?.includes(opt.value));

  if (_.isEmpty(options.deviceNames)) {
    // No devices selected → query all devices (same pattern as sites)
  }

  if (_.isEmpty(options.dimension)) {
    throw new Error('Query error: Dimensions field is required');
  }

  if (_.isEmpty(metricDefs)) {
    throw new Error('Query error: Metric field is required');
  }

  // ── Dimension ↔ Metric category compatibility check ─────────────────────
  // SNMP/ST dimensions and metrics must belong to the same category.
  // Crossing categories (e.g. SNMP Device dimension + SNMP Interface metric)
  // queries different KDE partitions and silently returns zero rows.
  const NMS_DIM_CATEGORIES = new Set<string>([
    DimensionCategory.SNMP_DEVICE,
    DimensionCategory.SNMP_INTERFACE,
    DimensionCategory.ST_INTERFACE,
  ]);

  const dimensionValues: string[] = options.dimension?.split(',') || [];
  const dimCategories = new Set<DimensionCategory>(
    dimensionValues
      .map((v: string) => dimensionList.find((d) => d.value === normaliseKtPrefix(v))?.category)
      .filter((c): c is DimensionCategory => !!c && NMS_DIM_CATEGORIES.has(c))
  );

  const metricCategories = new Set<DimensionCategory>(
    metricDefs
      .map((m: any): DimensionCategory | null => {
        const unit: string = m.unit || '';
        if (unit.startsWith('ktappprotocol__snmp_device_metrics__')) { return DimensionCategory.SNMP_DEVICE; }
        if (unit.startsWith('ktappprotocol__snmp__')) { return DimensionCategory.SNMP_INTERFACE; }
        if (unit.startsWith('ktappprotocol__st__')) { return DimensionCategory.ST_INTERFACE; }
        return null;
      })
      .filter((c): c is DimensionCategory => c !== null)
  );

  if (dimCategories.size > 0 && metricCategories.size > 0) {
    // Both sides are NMS — they must share the same category.
    for (const mc of metricCategories) {
      if (!dimCategories.has(mc)) {
        const dimCat = [...dimCategories][0];
        throw new Error(
          `Query error: ${dimCat} dimensions are not compatible with ${mc} metrics. ` +
          `SNMP/ST dimensions must be paired with metrics from the same category.`
        );
      }
    }
    for (const dc of dimCategories) {
      if (!metricCategories.has(dc)) {
        const metricCat = [...metricCategories][0];
        throw new Error(
          `Query error: ${dc} dimensions are not compatible with ${metricCat} metrics. ` +
          `SNMP/ST dimensions must be paired with metrics from the same category.`
        );
      }
    }
  } else if (dimCategories.size > 0 && metricCategories.size === 0) {
    // NMS dimensions with flow metrics — invalid.
    const dimCat = [...dimCategories][0];
    throw new Error(
      `Query error: ${dimCat} dimensions require SNMP/ST metrics, not flow metrics.`
    );
  }
  // Note: flow dimensions + NMS metrics is allowed (existing pattern in tests/dashboards).


  const startingTime = options.range.from.utc().format(KENTIK_TIME_FORMAT);
  const endingTime = options.range.to.utc().format(KENTIK_TIME_FORMAT);
  const isAllSitesSelected = options.siteNames?.split(',').includes(ALL_SITES_LABEL) || _.isEmpty(options.siteNames);
  const isAllDevicesSelected = options.deviceNames?.split(',').includes(ALL_DEVICES_LABEL) || _.isEmpty(options.deviceNames);

  // Determine whether this is an SNMP/NMS query.
  // SNMP data lives in full-data partitions only; 'Auto' routes to fast-data
  // and returns empty results.  The API infers the correct table from the
  // ktappprotocol__ prefix — no app_protocol needed.
  const isNmsQuery = isNmsMetric(metricDefs);

  const query: Record<string, any> = {
    dimension: options.dimension?.split(','),
    metric: _.uniq(metricDefs.map((m: any) => normaliseKtPrefix(m.unit))),
    matrixBy: [],
    cidr: 32,
    cidr6: 128,
    topx: options.topx,
    depth: isNmsQuery ? 75 : Math.max(Number(options.topx) || 10, 25),
    fastData: isNmsQuery ? 'Full' : 'Auto',
    lookback_seconds: 0,
    time_format: 'UTC',
    starting_time: startingTime,
    ending_time: endingTime,
    device_name: isAllDevicesSelected ? [] : options.deviceNames?.split(','),
    outsort: metricDefs[0]?.value,
    aggregates: metricDefs.map((m: any) => ({ ...m, raw: true })),
    filters: formatFilters(options.kentikFilterGroups),
    saved_filters: options.kentikSavedFilters,
    hostname_lookup: options.hostnameLookup,
    device_site: isAllSitesSelected ? null : options.siteNames?.split(','),
    aggregateTypes: metricDefs.map((agg: any) => agg.name),
  };

  if (isAllDevicesSelected) {
    query.all_devices = true;
  }

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
        if (savedFilterDef) {
          savedFilters.push(convertToKentikSavedFilter(filter, savedFilterDef));
        }
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
