import { ALL_DEVICES_LABEL, ALL_SITES_LABEL } from 'datasource/DataSource';
import queryBuilder from '../query_builder';

class Moment {
  time: string;

  constructor(time: string) {
    this.time = time;
  }
  utc() {
    return this;
  }
  format() {
    return this.time;
  }
}

describe('Kentik Query Builder', () => {
  const ctx: any = {};

  beforeEach(() => {
    ctx.range = {
      from: new Moment('1970-01-01 00:00:00'),
      to: new Moment('1970-01-01 01:00:00'),
    };
  });

  describe('When building Kentik filter group', () => {
    it('should build proper filters', (done) => {
      const filters = [{ key: 'Source Country', operator: '=', value: 'US' }];

      const expectedGroup = [
        {
          filters: [{ filterField: 'src_geo', operator: '=', filterValue: 'US' }],
          connector: 'All',
          not: false,
        },
      ];

      const filterGroup = queryBuilder.convertToKentikFilterGroup(filters, [], []);
      expect(filterGroup.kentikFilters).toEqual(expectedGroup);
      expect(filterGroup.savedFilters).toEqual([]);
      done();
    });
  });

  describe('When building topXData query', () => {
    beforeEach(() => {
      ctx.query_options = {
        metric: 'max_bits_per_sec,p99th_bits_per_sec',
        dimension: 'src_geo_region,traffic,top_flow',
        deviceNames: 'cat2_demo',
        siteNames: 'site1,site2,site3',
        range: ctx.range,
        kentikFilterGroups: [],
        topx: '8'
      };
    });

    it('should build proper topXData query when all sites selected', () => {
      ctx.query_options.siteNames = ALL_SITES_LABEL;
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_site: null }));
    });

    it('should build proper topXData query when no sites selected', () => {
      ctx.query_options.siteNames = null;
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_site: null }));
    });

    it('should build topXData query with all_devices when "All" is selected', () => {
      ctx.query_options.deviceNames = ALL_DEVICES_LABEL;
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_name: [], all_devices: true }));
    });

    it('should build topXData query with all_devices when no devices selected', () => {
      ctx.query_options.deviceNames = '';
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_name: [], all_devices: true }));
    });

    it('should build topXData query with all_devices when deviceNames is null', () => {
      ctx.query_options.deviceNames = null;
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_name: [], all_devices: true }));
    });

    it('should NOT set all_devices when specific devices are selected', () => {
      ctx.query_options.deviceNames = 'router1,router2';
      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expect.objectContaining({ device_name: ['router1', 'router2'] }));
      expect(topXDataQuery.all_devices).toBeUndefined();
    });

    it('should build proper topXData query', (done) => {
      const expectedQuery =  {
        dimension: [ 'src_geo_region', 'traffic', 'top_flow' ],
        metric: [ 'bytes' ],
        matrixBy: [],
        cidr: 32,
        cidr6: 128,
        topx: '8',
        depth: 100,
        fastData: 'Auto',
        lookback_seconds: 0,
        time_format: 'UTC',
        starting_time: '1970-01-01 00:00:00',
        ending_time: '1970-01-01 01:00:00',
        device_name: [ 'cat2_demo' ],
        outsort: 'p99th_bits_per_sec',
        aggregates: [
          {
            value: 'p99th_bits_per_sec',
            name: 'p99th_bits_per_sec',
            column: 'f_sum_both_bytes',
            fn: 'percentile',
            rank: 99,
            sample_rate: 1,
            raw: true,
            unit: 'bytes',
            group: 'Bits/s',
            label: '99th Percentile',
            origLabel: '99th Percentile',
          },
          {
            value: 'max_bits_per_sec',
            name: 'max_bits_per_sec',
            column: 'f_sum_both_bytes',
            fn: 'max',
            sample_rate: 1,
            raw: true,
            unit: 'bytes',
            group: 'Bits/s',
            label: 'Max',
            origLabel: 'Max',
          }
        ],
        filters: { connector: 'All', filterGroups: [] },
        saved_filters: undefined,
        hostname_lookup: undefined,
        device_site: [ 'site1', 'site2', 'site3' ],
        aggregateTypes: [ 'p99th_bits_per_sec', 'max_bits_per_sec' ]
      }

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expectedQuery);
      done();
    });

    it('should correctly derive metric, aggregates, aggregateTypes and outsort', () => {
      ctx.query_options.metric = 'avg_bits_per_sec,max_pkts_per_sec';

      const query = queryBuilder.buildTopXdataQuery(ctx.query_options);

      expect(query.metric).toEqual(['bytes', 'packets']);
      expect(query.aggregates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: 'avg_bits_per_sec',
            fn: 'average',
            name: 'avg_bits_per_sec',
            column: 'f_sum_both_bytes',
            unit: 'bytes',
            raw: true,
          }),
          expect.objectContaining({
            value: 'max_pkts_per_sec',
            fn: 'max',
            name: 'max_pkts_per_sec',
            column: 'f_sum_both_pkts',
            unit: 'packets',
            raw: true,
          }),
        ])
      );

      expect(query.aggregateTypes).toEqual([
        'avg_bits_per_sec',
        'max_pkts_per_sec',
      ]);

      expect(query.outsort).toBe('avg_bits_per_sec');
    });

  });

  // ── SNMP / NMS query routing ──────────────────────────────────────────────
  //
  // These tests verify that the API routing fields required for SNMP/NMS
  // queries are set correctly:
  //   • fastData: 'Full'  — SNMP columns only exist in full-data partitions
  //   • metric[]          — must use ktappprotocol__snmp__ short-form prefix
  //   • app_protocol      — must NOT be sent (API infers from prefix)
  //
  // Flow queries must not set app_protocol at all, and must use fastData: 'Auto'.

  describe('SNMP / NMS query routing', () => {
    let snmpOptions: any;

    beforeEach(() => {
      snmpOptions = {
        dimension: 'src_geo_region',
        deviceNames: 'router1',
        siteNames: null,
        range: ctx.range,
        kentikFilterGroups: [],
        topx: '8',
      };
    });

    it('flow metric → fastData Auto, no app_protocol', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_bits_per_sec',
      });
      expect(query.fastData).toBe('Auto');
      expect(query).not.toHaveProperty('app_protocol');
    });

    it('flow metric → metric array is unchanged (bytes)', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_bits_per_sec',
      });
      expect(query.metric).toEqual(['bytes']);
    });

    it('SNMP device metric → fastData Full, no app_protocol', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      expect(query.fastData).toBe('Full');
      expect(query).not.toHaveProperty('app_protocol');
    });

    it('SNMP interface metric → fastData Full, no app_protocol', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_ktappprotocol__snmp__INT64_00',
      });
      expect(query.fastData).toBe('Full');
      expect(query).not.toHaveProperty('app_protocol');
    });

    it('ST interface metric → fastData Full, no app_protocol', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_ktappprotocol__st__INT64_00',
      });
      expect(query.fastData).toBe('Full');
      expect(query).not.toHaveProperty('app_protocol');
    });

    it('multiple SNMP device metrics → fastData Full, no app_protocol', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,p95th_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      expect(query.fastData).toBe('Full');
      expect(query).not.toHaveProperty('app_protocol');
    });

    it('SNMP query has depth 75', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...snmpOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      expect(query.depth).toBe(75);
    });
  });

  // ── SNMP metric[] normalisation ─────────────────────────────────────────────
  //
  // The Kentik query API uses different wire prefixes per category:
  //   • SNMP Device    → ktappprotocol__snmp_device_metrics__  (long form)
  //   • SNMP Interface → ktappprotocol__snmp__                  (short form)
  //   • ST Interface   → ktappprotocol__st__                    (short form)
  //
  // metric_def.ts now stores the correct wire-format values directly.
  // The normaliser handles backward compat with old saved dashboards
  // that have `ktsubtype__` prefixes.

  describe('SNMP metric[] normalisation — every SNMP metric group', () => {
    let baseOptions: any;

    beforeEach(() => {
      baseOptions = {
        dimension: 'src_geo_region',
        deviceNames: 'router1',
        siteNames: null,
        range: ctx.range,
        kentikFilterGroups: [],
        topx: '8',
      };
    });

    // ── SNMP Device Metrics (long form: ktappprotocol__snmp_device_metrics__) ──

    describe('SNMP Device CPU (%) — INT64_00', () => {
      it.each([
        ['avg_ktappprotocol__snmp_device_metrics__INT64_00', 'average'],
        ['p95th_ktappprotocol__snmp_device_metrics__INT64_00', '95th percentile'],
        ['max_ktappprotocol__snmp_device_metrics__INT64_00', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp_device_metrics__ prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp_device_metrics__INT64_00']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('SNMP Device Memory Utilization (%) — INT64_01', () => {
      it.each([
        ['avg_ktappprotocol__snmp_device_metrics__INT64_01', 'average'],
        ['p95th_ktappprotocol__snmp_device_metrics__INT64_01', '95th percentile'],
        ['max_ktappprotocol__snmp_device_metrics__INT64_01', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp_device_metrics__ prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp_device_metrics__INT64_01']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('SNMP Device Uptime (s) — INT64_05', () => {
      it.each([
        ['avg_ktappprotocol__snmp_device_metrics__INT64_05', 'average'],
        ['max_ktappprotocol__snmp_device_metrics__INT64_05', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp_device_metrics__ prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp_device_metrics__INT64_05']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    // ── SNMP Interface Metrics (short form: ktappprotocol__snmp__) ─────────

    describe('SNMP Interface Inbound Traffic (bytes) — INT64_00', () => {
      it.each([
        ['avg_ktappprotocol__snmp__INT64_00', 'average'],
        ['p95th_ktappprotocol__snmp__INT64_00', '95th percentile'],
        ['max_ktappprotocol__snmp__INT64_00', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_00']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('SNMP Interface Outbound Traffic (bytes) — INT64_01', () => {
      it.each([
        ['avg_ktappprotocol__snmp__INT64_01', 'average'],
        ['p95th_ktappprotocol__snmp__INT64_01', '95th percentile'],
        ['max_ktappprotocol__snmp__INT64_01', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_01']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('SNMP Interface Inbound Errors — INT64_04', () => {
      it.each([
        ['avg_ktappprotocol__snmp__INT64_04', 'average'],
        ['max_ktappprotocol__snmp__INT64_04', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_04']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('SNMP Interface Outbound Errors — INT64_05', () => {
      it.each([
        ['avg_ktappprotocol__snmp__INT64_05', 'average'],
        ['max_ktappprotocol__snmp__INT64_05', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__snmp__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_05']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    // ── ST (Streaming Telemetry) Interface Metrics ─────────────────────────

    describe('ST Interface Inbound Traffic (bytes) — INT64_00', () => {
      it.each([
        ['avg_ktappprotocol__st__INT64_00', 'average'],
        ['p95th_ktappprotocol__st__INT64_00', '95th percentile'],
        ['max_ktappprotocol__st__INT64_00', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__st__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__st__INT64_00']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    describe('ST Interface Outbound Traffic (bytes) — INT64_01', () => {
      it.each([
        ['avg_ktappprotocol__st__INT64_01', 'average'],
        ['p95th_ktappprotocol__st__INT64_01', '95th percentile'],
        ['max_ktappprotocol__st__INT64_01', 'max'],
      ])('%s (%s) → metric uses ktappprotocol__st__ short prefix', (metricValue) => {
        const query = queryBuilder.buildTopXdataQuery({ ...baseOptions, metric: metricValue });
        expect(query.metric).toEqual(['ktappprotocol__st__INT64_01']);
        expect(query).not.toHaveProperty('app_protocol');
        expect(query.fastData).toBe('Full');
      });
    });

    // ── Migration: ktsubtype__ → ktappprotocol__ for SNMP/ST metrics ──────
    //
    // SNMP/ST metrics in metric_def.ts were migrated from ktsubtype__ to
    // ktappprotocol__ wire-format values. Dashboards saved with the previous
    // plugin version will still have ktsubtype__ in their query JSON.
    // The normaliser rewrites these at query time so existing dashboards
    // continue to work after upgrade:
    //   • ktsubtype__snmp_device_metrics__    → ktappprotocol__snmp_device_metrics__
    //   • ktsubtype__snmp_interface_metrics__ → ktappprotocol__snmp__
    //   • ktsubtype__st_interface_metrics__   → ktappprotocol__st__
    //
    // Note: non-SNMP dimensions (AWS, Azure, GCP, OCI, etc.) still use
    // ktsubtype__ natively — this migration only applies to SNMP/ST metrics.

    describe('migration: ktsubtype__ → correct ktappprotocol__ wire format', () => {
      it('ktsubtype__snmp_device_metrics__INT64_00 → ktappprotocol__snmp_device_metrics__INT64_00', () => {
        const query = queryBuilder.buildTopXdataQuery({
          ...baseOptions,
          metric: 'avg_ktsubtype__snmp_device_metrics__INT64_00',
        });
        expect(query.metric).toEqual(['ktappprotocol__snmp_device_metrics__INT64_00']);
        expect(query.fastData).toBe('Full');
        expect(query).not.toHaveProperty('app_protocol');
      });

      it('ktsubtype__snmp_interface_metrics__INT64_00 → ktappprotocol__snmp__INT64_00', () => {
        const query = queryBuilder.buildTopXdataQuery({
          ...baseOptions,
          metric: 'avg_ktsubtype__snmp_interface_metrics__INT64_00',
        });
        expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_00']);
        expect(query.fastData).toBe('Full');
      });

      it('ktsubtype__st_interface_metrics__INT64_00 → ktappprotocol__st__INT64_00', () => {
        const query = queryBuilder.buildTopXdataQuery({
          ...baseOptions,
          metric: 'avg_ktsubtype__st_interface_metrics__INT64_00',
        });
        expect(query.metric).toEqual(['ktappprotocol__st__INT64_00']);
        expect(query.fastData).toBe('Full');
      });
    });

    // ── Multi-metric selections ────────────────────────────────────────────

    it('multiple SNMP device metrics de-dup to one metric entry', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,p95th_ktappprotocol__snmp_device_metrics__INT64_00,max_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      // All three aggregates share the same unit → single entry after de-dup
      expect(query.metric).toEqual(['ktappprotocol__snmp_device_metrics__INT64_00']);
      expect(query.aggregates).toHaveLength(3);
    });

    it('multiple SNMP interface metrics de-dup to one metric entry', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp__INT64_04,max_ktappprotocol__snmp__INT64_04',
      });
      expect(query.metric).toEqual(['ktappprotocol__snmp__INT64_04']);
      expect(query.aggregates).toHaveLength(2);
    });

    it('SNMP device metrics from different columns produce distinct metric entries', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,avg_ktappprotocol__snmp_device_metrics__INT64_01',
      });
      expect(query.metric).toEqual(
        expect.arrayContaining([
          'ktappprotocol__snmp_device_metrics__INT64_00',
          'ktappprotocol__snmp_device_metrics__INT64_01',
        ])
      );
      expect(query.metric).toHaveLength(2);
    });

    // ── Aggregate integrity ────────────────────────────────────────────────
    //
    // Aggregate objects carry the wire-format values directly from metric_def.ts.
    // Device metrics use f_avg_ columns; interface metrics use f_sum_ columns.

    it('SNMP device aggregates use long-form prefix and f_avg_ columns', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      const agg = query.aggregates[0];
      expect(agg.unit).toBe('ktappprotocol__snmp_device_metrics__INT64_00');
      expect(agg.value).toBe('avg_ktappprotocol__snmp_device_metrics__INT64_00');
      expect(agg.name).toBe('avg_ktappprotocol__snmp_device_metrics__INT64_00');
      expect(agg.column).toBe('f_avg_int64_00');
      expect(agg.fn).toBe('average');
      expect(agg.raw).toBe(true);
    });

    it('SNMP interface aggregates use short-form prefix and f_sum_ columns', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp__INT64_04',
      });
      const agg = query.aggregates[0];
      expect(agg.unit).toBe('ktappprotocol__snmp__INT64_04');
      expect(agg.value).toBe('avg_ktappprotocol__snmp__INT64_04');
      expect(agg.name).toBe('avg_ktappprotocol__snmp__INT64_04');
      expect(agg.column).toBe('f_sum_int64_04');
      expect(agg.fn).toBe('average');
      expect(agg.raw).toBe(true);
    });

    it('outsort references the aggregate value', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      expect(query.outsort).toBe('avg_ktappprotocol__snmp_device_metrics__INT64_00');
    });

    it('aggregateTypes use aggregate names', () => {
      const query = queryBuilder.buildTopXdataQuery({
        ...baseOptions,
        metric: 'avg_ktappprotocol__snmp_device_metrics__INT64_00,max_ktappprotocol__snmp_device_metrics__INT64_00',
      });
      expect(query.aggregateTypes).toEqual([
        'avg_ktappprotocol__snmp_device_metrics__INT64_00',
        'max_ktappprotocol__snmp_device_metrics__INT64_00',
      ]);
    });
  });
});
