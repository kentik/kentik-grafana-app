import queryBuilder from './query_builder';

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
    it('should build proper filters', done => {
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
        unit: 'bytes',
        metric: 'src_geo_region',
        deviceNames: 'cat2_demo',
        range: ctx.range,
        kentikFilterGroups: [],
      };
    });

    it('should build proper topXData query', done => {
      const expectedQuery = {
        metric: 'bytes',
        dimension: ['src_geo_region'],
        device_name: 'cat2_demo',
        outsort: 'avg_both',
        time_format: 'UTC',
        ending_time: '1970-01-01 01:00:00',
        starting_time: '1970-01-01 00:00:00',
        matrixBy: [],
        cidr: 32,
        cidr6: 128,
        topx: '8',
        depth: 100,
        fastData: 'Auto',
        lookback_seconds: 0,
        filters_obj: {
          connector: 'All',
          filterGroups: [],
        },
        aggregates: [
          {
            name: 'avg_both',
            column: 'f_sum_both_bytes',
            fn: 'average',
            raw: true,
            sample_rate: 1,
          },
          {
            name: 'p95th_both',
            column: 'f_sum_both_bytes',
            fn: 'percentile',
            rank: 95,
            sample_rate: 1,
          },
          {
            name: 'max_both',
            column: 'f_sum_both_bytes',
            fn: 'max',
            sample_rate: 1,
          },
        ],
      };

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery).toEqual(expectedQuery);
      done();
    });

    it('should build proper Bits/s query', done => {
      ctx.query_options.unit = 'bytes';

      const expectedQuery = {
        metric: 'bytes',
        aggregates: [
          {
            name: 'avg_both',
            column: 'f_sum_both_bytes',
            fn: 'average',
            raw: true,
            sample_rate: 1,
          },
          {
            name: 'p95th_both',
            column: 'f_sum_both_bytes',
            fn: 'percentile',
            rank: 95,
            sample_rate: 1,
          },
          {
            name: 'max_both',
            column: 'f_sum_both_bytes',
            fn: 'max',
            sample_rate: 1,
          },
        ],
      };

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery.metric).toEqual(expectedQuery.metric);
      expect(topXDataQuery.aggregates).toEqual(expectedQuery.aggregates);
      done();
    });

    it('should build proper Packets/s query', done => {
      ctx.query_options.unit = 'packets';

      const expectedQuery = {
        metric: 'packets',
        aggregates: [
          {
            name: 'avg_both',
            column: 'f_sum_both_pkts',
            fn: 'average',
            raw: true,
            sample_rate: 1,
          },
          {
            name: 'p95th_both',
            column: 'f_sum_both_pkts',
            fn: 'percentile',
            rank: 95,
            sample_rate: 1,
          },
          {
            name: 'max_both',
            column: 'f_sum_both_pkts',
            fn: 'max',
            sample_rate: 1,
          },
        ],
      };

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery.metric).toEqual(expectedQuery.metric);
      expect(topXDataQuery.aggregates).toEqual(expectedQuery.aggregates);
      done();
    });

    it('should build proper Unique Src IPs query', done => {
      ctx.query_options.unit = 'unique_src_ip';

      const expectedQuery = {
        metric: 'unique_src_ip',
        aggregates: [
          {
            name: 'avg_ips',
            column: 'f_hll(inet_src_addr,0.0001)',
            fn: 'average',
            raw: true,
            sample_rate: 1,
          },
          {
            name: 'p95th_ips',
            column: 'f_hll(inet_src_addr,0.0001)',
            fn: 'percentile',
            rank: 95,
            sample_rate: 1,
          },
          {
            name: 'max_ips',
            column: 'f_hll(inet_src_addr,0.0001)',
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
        ],
      };

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery.metric).toEqual(expectedQuery.metric);
      expect(topXDataQuery.aggregates).toEqual(expectedQuery.aggregates);
      done();
    });

    it('should build proper Unique Dst IPs query', done => {
      ctx.query_options.unit = 'unique_dst_ip';

      const expectedQuery = {
        metric: 'unique_dst_ip',
        aggregates: [
          {
            name: 'avg_ips',
            column: 'f_hll(inet_dst_addr,0.0001)',
            fn: 'average',
            raw: true,
            sample_rate: 1,
          },
          {
            name: 'p95th_ips',
            column: 'f_hll(inet_dst_addr,0.0001)',
            fn: 'percentile',
            rank: 95,
            sample_rate: 1,
          },
          {
            name: 'max_ips',
            column: 'f_hll(inet_dst_addr,0.0001)',
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
        ],
      };

      const topXDataQuery = queryBuilder.buildTopXdataQuery(ctx.query_options);
      expect(topXDataQuery.metric).toEqual(expectedQuery.metric);
      expect(topXDataQuery.aggregates).toEqual(expectedQuery.aggregates);
      done();
    });
  });
});
