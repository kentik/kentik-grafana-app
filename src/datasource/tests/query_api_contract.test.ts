/**
 * API Contract Tests: Query Builder <-> Kentik API
 *
 * These tests verify that the queries built by query_builder.ts conform to the
 * Kentik API contract.  They catch:
 *
 *   1. Missing `raw: true` on aggregates -> API returns timeSeries: {}
 *   2. Wrong wire-format prefix in metric[] -> API 400 or empty results
 *   3. Wrong fastData mode for NMS metrics -> empty results
 *   4. Missing required aggregate fields -> API rejects query
 *   5. Metric option labels not containing group name -> search broken
 *
 * Each test loops over every metric definition internally and collects
 * failures, rather than creating a separate it() per metric.
 */

import queryBuilder from '../query_builder';
import { allMetricOptions, metricNestedList } from '../metric_def';

// -- Test Helpers -----------------------------------------------------------

class Moment {
  time: string;
  constructor(time: string) { this.time = time; }
  utc() { return this; }
  format() { return this.time; }
}

const baseOptions = {
  dimension: 'src_geo_region',
  deviceNames: 'router1',
  siteNames: null,
  range: {
    from: new Moment('2026-01-01 00:00:00'),
    to: new Moment('2026-01-01 01:00:00'),
  },
  kentikFilterGroups: [],
  topx: '8',
};

function buildForMetric(metricValue: string) {
  return queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
}

const REQUIRED_AGGREGATE_FIELDS = ['value', 'column', 'fn', 'unit', 'name', 'raw'] as const;
const STRING_AGGREGATE_FIELDS = ['value', 'column', 'fn', 'unit', 'name'] as const;

const NMS_PREFIXES = [
  'ktappprotocol__snmp_device_metrics__',
  'ktappprotocol__snmp__',
  'ktappprotocol__st__',
];

function isNmsValue(value: string): boolean {
  return NMS_PREFIXES.some((p) => value.includes(p));
}

// -- 1. Every metric produces a buildable query -----------------------------

describe('Every metric in allMetricOptions builds a valid query', () => {
  it('builds without throwing, with non-empty metric[] and aggregates', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      if (!query) {
        failures.push(metric.value + ': build returned falsy');
        continue;
      }
      if (!query.metric || !query.metric.length) {
        failures.push(metric.value + ': empty metric[]');
      }
      if (!query.aggregates || !query.aggregates.length) {
        failures.push(metric.value + ': no aggregates');
      }
    }
    expect(failures).toEqual([]);
  });

  it('outsort references the metric value', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      if (query.outsort !== metric.value) {
        failures.push(metric.value + ': outsort is "' + query.outsort + '"');
      }
    }
    expect(failures).toEqual([]);
  });

  it('aggregateTypes includes the metric name', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      if (!query.aggregateTypes || !query.aggregateTypes.includes(metric.name)) {
        failures.push(metric.value + ': aggregateTypes missing "' + metric.name + '"');
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 2. Every aggregate has correct fields ----------------------------------

describe('Aggregate field correctness', () => {
  it('every aggregate has raw: true', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      for (const agg of query.aggregates) {
        if (agg.raw !== true) {
          failures.push(metric.value + ': aggregate "' + agg.value + '" has raw=' + agg.raw);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every aggregate has all required API fields as non-empty strings', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      for (const agg of query.aggregates) {
        for (const field of REQUIRED_AGGREGATE_FIELDS) {
          if (agg[field] === undefined || agg[field] === null) {
            failures.push(metric.value + ': aggregate missing "' + field + '"');
          }
        }
        for (const field of STRING_AGGREGATE_FIELDS) {
          if (typeof agg[field] !== 'string' || agg[field].length === 0) {
            failures.push(metric.value + ': aggregate "' + field + '" is not a non-empty string');
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('outsort matches an aggregate value', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      const aggValues = query.aggregates.map((a: any) => a.value);
      if (!aggValues.includes(query.outsort)) {
        failures.push(metric.value + ': outsort "' + query.outsort + '" not in aggregate values');
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 3. NMS vs flow query routing -------------------------------------------

describe('NMS vs flow query routing', () => {
  it('NMS metrics use fastData=Full, flow metrics use fastData=Auto', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      const expected = isNmsValue(metric.value) ? 'Full' : 'Auto';
      if (query.fastData !== expected) {
        failures.push(metric.value + ': fastData="' + query.fastData + '", expected "' + expected + '"');
      }
    }
    expect(failures).toEqual([]);
  });

  it('no metric sends app_protocol', () => {
    const failures: string[] = [];
    for (const metric of allMetricOptions) {
      const query = buildForMetric(metric.value);
      if ('app_protocol' in query) {
        failures.push(metric.value + ': has app_protocol');
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 4. NMS metric[] wire-format prefix -------------------------------------

describe('NMS metric[] uses correct wire prefix', () => {
  it('every NMS metric[] entry starts with a known NMS prefix', () => {
    const nmsMetrics = allMetricOptions.filter((m) => isNmsValue(m.value));
    const failures: string[] = [];
    for (const metric of nmsMetrics) {
      const query = buildForMetric(metric.value);
      for (const entry of query.metric) {
        if (!NMS_PREFIXES.some((p) => entry.startsWith(p))) {
          failures.push(metric.value + ': metric[] entry "' + entry + '" has no known NMS prefix');
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('no NMS metric[] entry contains legacy prefixes', () => {
    const nmsMetrics = allMetricOptions.filter((m) => isNmsValue(m.value));
    const failures: string[] = [];
    for (const metric of nmsMetrics) {
      const query = buildForMetric(metric.value);
      for (const entry of query.metric) {
        if (entry.includes('ktsubtype__')) {
          failures.push(metric.value + ': "' + entry + '" has ktsubtype__');
        }
        if (entry.includes('snmp_interface_metrics')) {
          failures.push(metric.value + ': "' + entry + '" has snmp_interface_metrics');
        }
        if (entry.includes('st_interface_metrics')) {
          failures.push(metric.value + ': "' + entry + '" has st_interface_metrics');
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 5. NMS aggregate columns follow gauge/counter convention ---------------

describe('NMS aggregate columns follow gauge/counter convention', () => {
  it('SNMP Device groups use f_avg_ columns, interface groups use f_sum_', () => {
    const failures: string[] = [];
    for (const group of metricNestedList) {
      if (!group.compatibleCategory) {
        continue;
      }
      if (group.unit.startsWith('ktappprotocol__snmp_device_metrics__')) {
        if (!/^f_avg_/.test(group.column)) {
          failures.push('SNMP Device "' + group.label + '": column "' + group.column + '" should start with f_avg_');
        }
      } else if (group.unit.startsWith('ktappprotocol__snmp__') || group.unit.startsWith('ktappprotocol__st__')) {
        if (!/^f_sum_/.test(group.column)) {
          failures.push('Interface "' + group.label + '": column "' + group.column + '" should start with f_sum_');
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 6. Multi-metric de-duplication -----------------------------------------

describe('Multi-metric de-duplication', () => {
  it('NMS groups with multiple agg functions de-dup to a single metric[] entry', () => {
    const multiOptionNmsGroups = metricNestedList.filter(
      (g) => g.compatibleCategory && g.options.length >= 2
    );
    const failures: string[] = [];
    for (const group of multiOptionNmsGroups) {
      const allValues = group.options.map((o) => o.value).join(',');
      const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: allValues });
      if (query.metric.length !== 1) {
        failures.push(group.label + ': expected 1 metric[] entry, got ' + query.metric.length);
      }
      if (query.aggregates.length !== group.options.length) {
        failures.push(group.label + ': expected ' + group.options.length + ' aggregates, got ' + query.aggregates.length);
      }
    }
    expect(failures).toEqual([]);
  });
});

// -- 7. Metric option flattening: labels contain group name -----------------

describe('Metric option flattening: labels contain group name', () => {
  function flattenForUI(groups: typeof metricNestedList) {
    return groups.flatMap((group) =>
      group.options.map((opt) => ({
        ...opt,
        label: group.label + ' / ' + opt.label,
        value: opt.value,
        group: group.label,
      }))
    );
  }

  const flattened = flattenForUI(metricNestedList);

  it('every label starts with "group / " and no label is a bare aggregation name', () => {
    const bareNames = new Set(['Average', '95th Percentile', '99th Percentile', 'Max']);
    const failures: string[] = [];
    for (const opt of flattened) {
      if (!opt.label.startsWith(opt.group + ' / ')) {
        failures.push('"' + opt.label + '" does not start with "' + opt.group + ' / "');
      }
      if (bareNames.has(opt.label)) {
        failures.push('"' + opt.label + '" is a bare aggregation name');
      }
      if (typeof opt.group !== 'string' || opt.group.length === 0) {
        failures.push('"' + opt.label + '" has empty/missing group');
      }
    }
    expect(failures).toEqual([]);
  });

  it('searching "SNMP" matches at least 3 labels', () => {
    const count = flattened.filter((o) => o.label.toLowerCase().includes('snmp')).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('searching "Bits" matches at least 3 labels', () => {
    const count = flattened.filter((o) => o.label.toLowerCase().includes('bits')).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// -- 8. All flattened metrics have raw: true --------------------------------

describe('Flattened metric definitions', () => {
  it('every metric in allMetricOptions has raw: true', () => {
    const failures = allMetricOptions
      .filter((m) => m.raw !== true)
      .map((m) => m.value);
    expect(failures).toEqual([]);
  });
});

// -- 9. Cross-combination: flow + NMS metrics -------------------------------

describe('Cross-metric-type combinations', () => {
  it('two flow metrics from different groups build successfully', () => {
    const query = queryBuilder.buildTopXdataQuery({
      ...baseOptions,
      metric: 'avg_bits_per_sec,avg_pkts_per_sec',
    });
    expect(query.aggregates).toHaveLength(2);
    expect(query.metric).toEqual(expect.arrayContaining(['bytes', 'packets']));
    expect(query.fastData).toBe('Auto');
  });

  it('two SNMP device metrics from different columns build successfully', () => {
    const query = queryBuilder.buildTopXdataQuery({
      ...baseOptions,
      metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,avg_ktappprotocol__snmp_device_metrics__INT64_01',
    });
    expect(query.aggregates).toHaveLength(2);
    expect(query.fastData).toBe('Full');
    for (const agg of query.aggregates) {
      expect(agg.raw).toBe(true);
    }
  });

  it('three aggregation functions for one SNMP metric build with correct count', () => {
    const query = queryBuilder.buildTopXdataQuery({
      ...baseOptions,
      metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,p95th_ktappprotocol__snmp_device_metrics__INT64_00,max_ktappprotocol__snmp_device_metrics__INT64_00',
    });
    expect(query.aggregates).toHaveLength(3);
    expect(query.metric).toHaveLength(1);
    for (const agg of query.aggregates) {
      expect(agg.raw).toBe(true);
    }
  });
});
