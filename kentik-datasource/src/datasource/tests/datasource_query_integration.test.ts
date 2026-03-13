/**
 * Integration tests: DataSource.query() → processResponse() → DataFrames
 *
 * These tests exercise the FULL query pipeline with mock Kentik API responses,
 * verifying that:
 *   1. The query builder produces the right payload shape
 *   2. The response processor correctly transforms Kentik data into DataFrames
 *   3. Empty responses are handled gracefully
 *   4. The new aggregate shape (with extra UI fields) works end-to-end
 *
 * This is the "testing miss" — previous tests mocked away the response entirely,
 * never verifying the DataSource→KentikProxy→processResponse→DataFrame chain.
 */

import { DataSource } from '../DataSource';
import { FieldType } from '@grafana/data';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * A realistic Kentik v5 topXdata response for a standard flow query
 * (IP_src dimension, avg_bits_per_sec aggregate).
 */
function makeKentikTopXResponse(rows: any[]) {
  return {
    results: [
      {
        bucket: 'Left +Y Axis',
        data: rows,
      },
    ],
  };
}

/** Build a single TopX row with timeSeries flow data. */
function makeFlowRow(key: string, aggName: string, flowPoints: Array<[number, number]>) {
  return {
    key,
    [aggName]: flowPoints.reduce((sum, p) => sum + p[1], 0) / flowPoints.length,
    timeSeries: {
      [aggName]: {
        flow: flowPoints,
      },
    },
  };
}

/** Build a single TopX row with only scalar aggregate values (NMS/SNMP style). */
function makeScalarRow(key: string, aggName: string, value: number) {
  return {
    key,
    [aggName]: value,
    timeSeries: {},
  };
}

function createMoment(timeStr: string) {
  return {
    utc: () => ({
      format: () => timeStr,
    }),
  };
}

function createDatasourceWithMocks(
  topXResponseData: any,
  drilldownUrl = 'https://portal.kentik.com/v4/explorer'
) {
  const instanceSettings = {};

  const backendSrv: any = {
    get: () => Promise.resolve([]),
    fetch: () => ({
      toPromise: () =>
        Promise.resolve({ status: 200, data: { dimensions: [] } }),
      subscribe: (observer: any) => {
        observer.next({ status: 200, data: { dimensions: [] } });
        observer.complete();
      },
    }),
    post: (_url: string, _data: any) => {
      // The post is called for topXdata and url queries.
      // Return the mock response for topXdata, a string for url.
      if (_url.includes('topXdata')) {
        return Promise.resolve(topXResponseData);
      }
      if (_url.includes('/url')) {
        return Promise.resolve(drilldownUrl);
      }
      return Promise.resolve({});
    },
  };

  // @ts-ignore — test-only constructor with injected backendSrv
  const ds = new DataSource(instanceSettings, backendSrv);
  // Ensure initialRun doesn't short-circuit
  ds.initialRun = false;
  // Mock templateSrv (not available outside Grafana runtime)
  ds.templateSrv = {
    replace: jest.fn((value: string) => value),
  } as any;

  return ds;
}

function makeQueryOptions(overrides: Record<string, any> = {}) {
  return {
    targets: [
      {
        mode: 'graph',
        dimension: 'IP_src',
        metric: 'avg_bits_per_sec',
        devices: '',
        sites: '',
        topx: '8',
        hostnameLookup: '',
        customFilters: [],
        prefix: '',
        aliasBy: '',
        ...overrides,
      },
    ],
    range: {
      from: createMoment('2026-03-10 00:00:00'),
      to: createMoment('2026-03-10 03:00:00'),
    },
    scopedVars: {},
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DataSource.query() integration – full pipeline', () => {
  describe('graph mode with timeSeries flow data', () => {
    it('should produce DataFrames with time + value fields from Kentik timeSeries', async () => {
      const flowPoints: Array<[number, number]> = [
        [1710028800000, 1000],
        [1710029100000, 1500],
        [1710029400000, 1200],
      ];

      const kentikResponse = makeKentikTopXResponse([
        makeFlowRow('1.2.3.4', 'avg_bits_per_sec', flowPoints),
        makeFlowRow('5.6.7.8', 'avg_bits_per_sec', [
          [1710028800000, 2000],
          [1710029100000, 2500],
        ]),
      ]);

      const ds = createDatasourceWithMocks(kentikResponse);
      const result = await ds.query(makeQueryOptions() as any);

      // Should produce 2 DataFrames (one per top-x row)
      expect(result.data).toHaveLength(2);

      // First frame: 1.2.3.4
      const frame0 = result.data[0];
      expect(frame0.fields).toHaveLength(2);
      expect(frame0.fields[0].type).toBe(FieldType.time);
      expect(frame0.fields[0].values).toEqual([1710028800000, 1710029100000, 1710029400000]);
      expect(frame0.fields[1].type).toBe(FieldType.number);
      expect(frame0.fields[1].values).toEqual([1000, 1500, 1200]);

      // Second frame: 5.6.7.8
      const frame1 = result.data[1];
      expect(frame1.fields[0].values).toEqual([1710028800000, 1710029100000]);
      expect(frame1.fields[1].values).toEqual([2000, 2500]);
    });

    it('should include drilldown link on the value field', async () => {
      const kentikResponse = makeKentikTopXResponse([
        makeFlowRow('1.2.3.4', 'avg_bits_per_sec', [[1710028800000, 1000]]),
      ]);

      const ds = createDatasourceWithMocks(kentikResponse, 'https://portal.kentik.com/explore');
      const result = await ds.query(makeQueryOptions() as any);

      const valueField = result.data[0].fields[1];
      expect(valueField.config.links).toEqual([
        expect.objectContaining({
          title: 'Open in Kentik',
          url: 'https://portal.kentik.com/explore',
          targetBlank: true,
        }),
      ]);
    });

    it('should respect topx limit', async () => {
      // Build 10 rows but topx is 3
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeFlowRow(`10.0.0.${i}`, 'avg_bits_per_sec', [[1710028800000, i * 100]])
      );

      const kentikResponse = makeKentikTopXResponse(rows);
      const ds = createDatasourceWithMocks(kentikResponse);
      const result = await ds.query(makeQueryOptions({ topx: '3' }) as any);

      expect(result.data).toHaveLength(3);
    });
  });

  describe('graph mode with scalar NMS/SNMP data (no timeSeries)', () => {
    it('should produce a flat two-point series from scalar aggregate values', async () => {
      const kentikResponse = makeKentikTopXResponse([
        makeScalarRow('router1::eth0', 'avg_bits_per_sec', 42000),
      ]);

      const ds = createDatasourceWithMocks(kentikResponse);
      const result = await ds.query(makeQueryOptions() as any);

      expect(result.data).toHaveLength(1);

      const frame = result.data[0];
      expect(frame.fields[0].type).toBe(FieldType.time);
      expect(frame.fields[0].values).toHaveLength(2); // start + end
      expect(frame.fields[1].type).toBe(FieldType.number);
      expect(frame.fields[1].values).toEqual([42000, 42000]);
    });
  });

  describe('empty Kentik response', () => {
    it('should return empty data array when Kentik returns no rows', async () => {
      const kentikResponse = makeKentikTopXResponse([]);

      const ds = createDatasourceWithMocks(kentikResponse);
      const result = await ds.query(makeQueryOptions() as any);

      expect(result.data).toEqual([]);
    });
  });

  describe('table mode', () => {
    it('should produce a frame with dimension + metric columns', async () => {
      const kentikResponse = makeKentikTopXResponse([
        { key: '1.2.3.4', IP_src: '1.2.3.4', avg_bits_per_sec: 5000 },
        { key: '5.6.7.8', IP_src: '5.6.7.8', avg_bits_per_sec: 3000 },
      ]);

      const ds = createDatasourceWithMocks(kentikResponse);
      const result = await ds.query(makeQueryOptions({ mode: 'table' }) as any);

      // Table mode returns frame(s) inside data[]
      expect(result.data).toBeDefined();
      // The flattened result should contain a frame with fields
      const frame: any = Array.isArray(result.data) ? result.data : [result.data];
      expect(frame.length).toBeGreaterThanOrEqual(1);
      expect(frame[0].fields?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('multiple metrics (multiple aggregates)', () => {
    it('should fire one query per aggregate and merge results', async () => {
      const flowPoints: Array<[number, number]> = [
        [1710028800000, 1000],
        [1710029100000, 1500],
      ];

      const kentikResponse = makeKentikTopXResponse([
        makeFlowRow('1.2.3.4', 'avg_bits_per_sec', flowPoints),
      ]);

      const ds = createDatasourceWithMocks(kentikResponse);

      // Spy on the proxy to track how many queries are fired
      const invokeSpy = jest.spyOn(ds.kentik, 'invokeTopXDataQuery');
      invokeSpy.mockResolvedValue({
        data: kentikResponse,
        url: 'https://portal.kentik.com/explore',
      });

      const result = await ds.query(
        makeQueryOptions({ metric: 'avg_bits_per_sec,max_bits_per_sec' }) as any
      );

      // 2 metrics → 2 queries
      expect(invokeSpy.mock.calls).toHaveLength(2);

      // Each query should have exactly 1 aggregate
      for (const call of invokeSpy.mock.calls) {
        const q: any = call[0];
        expect(q.aggregates).toHaveLength(1);
        expect(q.outsort).toBe(q.aggregates[0].name);
      }

      // Both return 1 row → 2 DataFrames
      expect(result.data).toHaveLength(2);
    });
  });

  describe('aggregate shape sent to Kentik', () => {
    it('should include raw:true and all metric definition fields', async () => {
      const kentikResponse = makeKentikTopXResponse([]);

      const ds = createDatasourceWithMocks(kentikResponse);
      const invokeSpy = jest.spyOn(ds.kentik, 'invokeTopXDataQuery');
      invokeSpy.mockResolvedValue({ data: kentikResponse, url: '' });

      await ds.query(makeQueryOptions({ metric: 'avg_bits_per_sec' }) as any);

      const query: any = invokeSpy.mock.calls[0][0];
      const agg = query.aggregates[0];

      // Core API fields
      expect(agg.name).toBe('avg_bits_per_sec');
      expect(agg.column).toBe('f_sum_both_bytes');
      expect(agg.fn).toBe('average');
      expect(agg.raw).toBe(true);
      expect(agg.sample_rate).toBe(1);

      // Full metric definition fields (needed for SNMP query routing)
      expect(agg.value).toBe('avg_bits_per_sec');
      expect(agg.unit).toBe('bytes');
      expect(agg.group).toBe('Bits/s');
      expect(agg.label).toBe('Average');
    });

    it('should set outsort equal to the single aggregate name', async () => {
      const kentikResponse = makeKentikTopXResponse([]);
      const ds = createDatasourceWithMocks(kentikResponse);
      const invokeSpy = jest.spyOn(ds.kentik, 'invokeTopXDataQuery');
      invokeSpy.mockResolvedValue({ data: kentikResponse, url: '' });

      await ds.query(makeQueryOptions({ metric: 'p95th_bits_per_sec' }) as any);

      const query: any = invokeSpy.mock.calls[0][0];
      expect(query.outsort).toBe('p95th_bits_per_sec');
      expect(query.aggregateTypes).toEqual(['p95th_bits_per_sec']);
    });
  });

  describe('query wrapping for Kentik v5 API', () => {
    it('should wrap query in version:4 envelope with bucket', async () => {
      const instanceSettings = {};
      let capturedPayload: any = null;

      const backendSrv: any = {
        get: () => Promise.resolve([]),
        fetch: () => ({
          subscribe: (observer: any) => {
            observer.next({ status: 200, data: { dimensions: [] } });
            observer.complete();
          },
        }),
        post: (url: string, data: any) => {
          if (url.includes('topXdata')) {
            capturedPayload = data;
            return Promise.resolve(makeKentikTopXResponse([]));
          }
          return Promise.resolve('');
        },
      };

      // @ts-ignore
      const ds = new DataSource(instanceSettings, backendSrv);
      ds.initialRun = false;
      ds.templateSrv = { replace: jest.fn((v: string) => v) } as any;

      await ds.query(makeQueryOptions() as any);

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.version).toBe(4);
      expect(capturedPayload.queries).toHaveLength(1);
      expect(capturedPayload.queries[0].bucket).toBe('Left +Y Axis');
      expect(capturedPayload.queries[0].isOverlay).toBe(false);
      expect(capturedPayload.queries[0].query).toBeDefined();
      expect(capturedPayload.queries[0].query.dimension).toEqual(['IP_src']);
      expect(capturedPayload.queries[0].query.metric).toEqual(['bytes']);
      expect(capturedPayload.queries[0].query.aggregates[0].raw).toBe(true);
    });
  });
});
