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
        depth: 25,
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
  // (Removed: SNMP, ST, and legacy kproxy metrics have been deprecated
  //  and removed from the metric catalogue. The query_builder normalisation
  //  logic is retained for backward compat with saved dashboards but no
  //  longer needs dedicated test coverage.)
});
