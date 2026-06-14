/**
 * Tests for UDE query execution path in DataSource.
 *
 * Verifies:
 * - UDE queries are detected and routed to the Query API
 * - QueryResults are correctly parsed into Grafana DataFrames (time-series + table)
 * - Legacy queries still work alongside UDE queries
 * - Edge cases (empty results, missing fields)
 */
import { DataSource } from '../DataSource';
import { UDE_QUERY_TYPE } from '../ude_types';
import { VizType } from '../ude_query_builder';
import { FieldType } from '@grafana/data';

// Avoid the alert helper's dependency on Grafana's appEvents bus in tests.
jest.mock('../../utils/alert_helper', () => ({
  showAlert: jest.fn(),
  showCustomAlert: jest.fn(),
}));

// Mock @grafana/runtime so DataSource constructor uses our mock backend.
let mockBackendSrv: any = { fetch: jest.fn() };
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => mockBackendSrv,
  getTemplateSrv: () => ({
    replace: (v: string) => v || '',
    getVariables: () => [],
  }),
}));

// ── Mock backend ─────────────────────────────────────────────────────────────

function createMockBackendSrv(responses: Record<string, any> = {}) {
  return {
    fetch: jest.fn((options: any) => {
      const url = options.url || '';
      for (const [pattern, response] of Object.entries(responses)) {
        if (url.includes(pattern)) {
          return {
            toPromise: () => Promise.resolve({ data: response }),
            pipe: () => ({ toPromise: () => Promise.resolve({ data: response }) }),
            subscribe: (handlers: any) => {
              handlers.next?.({ data: response });
              handlers.complete?.();
            },
          };
        }
      }
      return {
        toPromise: () => Promise.resolve({ data: {} }),
        pipe: () => ({ toPromise: () => Promise.resolve({ data: {} }) }),
        subscribe: (handlers: any) => {
          handlers.next?.({ data: {} });
          handlers.complete?.();
        },
      };
    }),
  };
}

function createDataSource(backend: any) {
  mockBackendSrv = backend;
  const instanceSettings = {
    id: 1,
    uid: 'test-uid',
    type: 'kentik-datasource',
    name: 'Kentik',
    url: '/api/datasources/proxy/uid/test-uid',
    jsonData: { region: 'default', email: 'test@test.com' },
    meta: {} as any,
    readOnly: false,
    access: 'proxy' as const,
  };

  return new DataSource(instanceSettings as any);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UDE Query Execution', () => {
  describe('isUDEQuery detection', () => {
    it('routes UDE queries separately from legacy', async () => {
      const executeQueryResponse = {
        results: {
          timestamps: [1700000000, 1700000060, 1700000120],
          rows: [
            {
              dimensions: { src_addr: '10.0.0.1' },
              values: { bytes: [100, 200, 300] },
              rollups: { bytes: 600 },
            },
          ],
        },
      };

      const mockBackend = createMockBackendSrv({
        '/query/': executeQueryResponse,
      });

      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['src_addr'],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000120000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].fields).toHaveLength(2);
      expect(result.data[0].fields[0].name).toBe('time');
      expect(result.data[0].fields[0].type).toBe(FieldType.time);
      expect(result.data[0].fields[0].values).toEqual([1700000000000, 1700000060000, 1700000120000]);
      expect(result.data[0].fields[1].name).toBe('10.0.0.1 - bytes');
      expect(result.data[0].fields[1].values).toEqual([100, 200, 300]);
    });

    it('skips UDE targets with no measurement', async () => {
      const mockBackend = createMockBackendSrv({});
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '',
            dimensions: [],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000120000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(0);
    });

    it('skips UDE targets with no metrics', async () => {
      const mockBackend = createMockBackendSrv({});
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['src_addr'],
            metrics: [],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000120000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(0);
    });
  });

  describe('parseUDEQueryResults', () => {
    it('parses time-series response with multiple metrics', async () => {
      const executeQueryResponse = {
        results: {
          timestamps: [1700000000, 1700000060],
          rows: [
            {
              dimensions: { device: 'router-1' },
              values: { bytes_in: [1000, 2000], bytes_out: [500, 600] },
              rollups: {},
            },
          ],
        },
      };

      const mockBackend = createMockBackendSrv({
        '/query/': executeQueryResponse,
      });
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['device'],
            metrics: ['bytes_in', 'bytes_out'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000060000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      // 2 metrics × 1 row = 2 frames
      expect(result.data).toHaveLength(2);
      expect(result.data[0].fields[1].name).toBe('router-1 - bytes_in');
      expect(result.data[0].fields[1].values).toEqual([1000, 2000]);
      expect(result.data[1].fields[1].name).toBe('router-1 - bytes_out');
      expect(result.data[1].fields[1].values).toEqual([500, 600]);
    });

    it('parses table/aggregate response (no timestamps)', async () => {
      const executeQueryResponse = {
        results: {
          timestamps: [],
          rows: [
            { dimensions: { src_addr: '10.0.0.1' }, values: {}, rollups: { bytes: 5000 } },
            { dimensions: { src_addr: '10.0.0.2' }, values: {}, rollups: { bytes: 3000 } },
          ],
        },
      };

      const mockBackend = createMockBackendSrv({
        '/query/': executeQueryResponse,
      });
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['src_addr'],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.TABLE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000120000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(1);
      const frame = result.data[0];
      expect(frame.fields).toHaveLength(2); // 1 dim + 1 metric
      expect(frame.fields[0].name).toBe('src_addr');
      expect(frame.fields[0].values).toEqual(['10.0.0.1', '10.0.0.2']);
      expect(frame.fields[1].name).toBe('bytes');
      expect(frame.fields[1].values).toEqual([5000, 3000]);
    });

    it('handles empty results gracefully', async () => {
      const executeQueryResponse = {
        results: {
          timestamps: [],
          rows: [],
        },
      };

      const mockBackend = createMockBackendSrv({
        '/query/': executeQueryResponse,
      });
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['src_addr'],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000120000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(0);
    });

    it('parses multiple rows as separate series', async () => {
      const executeQueryResponse = {
        results: {
          timestamps: [1700000000, 1700000060],
          rows: [
            { dimensions: { src_addr: '10.0.0.1' }, values: { bytes: [100, 200] }, rollups: {} },
            { dimensions: { src_addr: '10.0.0.2' }, values: { bytes: [300, 400] }, rollups: {} },
          ],
        },
      };

      const mockBackend = createMockBackendSrv({
        '/query/': executeQueryResponse,
      });
      const ds = createDataSource(mockBackend);

      const options = {
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: 'flow',
            dimensions: ['src_addr'],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000060000 },
        },
        filters: [],
      };

      const result = await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({
          next: resolve,
          error: reject,
        });
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].fields[1].name).toBe('10.0.0.1 - bytes');
      expect(result.data[1].fields[1].name).toBe('10.0.0.2 - bytes');
    });
  });

  describe('getDictionaryService', () => {
    it('exposes the dictionary service', () => {
      const mockBackend = createMockBackendSrv({});
      const ds = createDataSource(mockBackend);
      const dictService = ds.getDictionaryService();
      expect(dictService).not.toBeNull();
      expect(typeof dictService.getMeasurements).toBe('function');
    });
  });

  describe('value-shape coercion (gateway variations)', () => {
    function run(executeResponse: any) {
      const mockBackend = createMockBackendSrv({ '/query/': executeResponse });
      const ds = createDataSource(mockBackend);
      const options = {
        intervalMs: 60000,
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '/traffic',
            dimensions: ['device'],
            metrics: ['bytes'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: { from: { valueOf: () => 1700000000000 }, to: { valueOf: () => 1700000120000 } },
        filters: [],
      };
      return new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({ next: resolve, error: reject });
      });
    }

    it('handles string-encoded timestamps and values', async () => {
      const result = await run({
        results: {
          timestamps: ['1700000000', '1700000060'],
          rows: [{ dimensions: { device: 'r1' }, values: { bytes: ['100', '200'] }, rollups: {} }],
        },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].fields[0].values).toEqual([1700000000000, 1700000060000]);
      expect(result.data[0].fields[1].values).toEqual([100, 200]);
    });

    it('handles a { values: [...] } wrapped series', async () => {
      const result = await run({
        results: {
          timestamps: [1700000000, 1700000060],
          rows: [{ dimensions: { device: 'r1' }, values: { bytes: { values: [10, 20] } }, rollups: {} }],
        },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].fields[1].values).toEqual([10, 20]);
    });

    it('broadcasts a scalar value across the timestamp axis (no t.map crash)', async () => {
      const result = await run({
        results: {
          timestamps: [1700000000, 1700000060, 1700000120],
          rows: [{ dimensions: { device: 'r1' }, values: { bytes: 42 }, rollups: {} }],
        },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].fields[1].values).toEqual([42, 42, 42]);
    });

    it('tolerates non-array timestamps/rows without throwing', async () => {
      const result = await run({ results: { timestamps: null, rows: null } });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('window size (required by Query API)', () => {
    function getExecuteBody(mockBackend: any): any {
      const call = mockBackend.fetch.mock.calls.find((c: any[]) => (c[0]?.url || '').includes('/query/'));
      return call?.[0]?.data;
    }

    it('auto-derives window.size from intervalMs when not specified', async () => {
      const mockBackend = createMockBackendSrv({
        '/query/': { results: { timestamps: [], rows: [] } },
      });
      const ds = createDataSource(mockBackend);

      const options = {
        intervalMs: 300000, // 5 min → 300s window
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '/traffic',
            dimensions: [],
            metrics: ['both_bits_per_sec'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700003600000 },
        },
        filters: [],
      };

      await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({ next: resolve, error: reject });
      });

      const body = getExecuteBody(mockBackend);
      expect(body.query.window).toBeDefined();
      expect(body.query.window.size).toBe(300);
    });

    it('enforces a 60s floor on derived window', async () => {
      const mockBackend = createMockBackendSrv({
        '/query/': { results: { timestamps: [], rows: [] } },
      });
      const ds = createDataSource(mockBackend);

      const options = {
        intervalMs: 1000, // 1s → floored to 60s
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '/traffic',
            dimensions: [],
            metrics: ['both_bits_per_sec'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700000060000 },
        },
        filters: [],
      };

      await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({ next: resolve, error: reject });
      });

      const body = getExecuteBody(mockBackend);
      expect(body.query.window.size).toBe(60);
    });

    it('respects an explicit windowSize from the editor', async () => {
      const mockBackend = createMockBackendSrv({
        '/query/': { results: { timestamps: [], rows: [] } },
      });
      const ds = createDataSource(mockBackend);

      const options = {
        intervalMs: 300000,
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '/traffic',
            dimensions: [],
            metrics: ['both_bits_per_sec'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
            windowSize: 3600,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700003600000 },
        },
        filters: [],
      };

      await new Promise<any>((resolve, reject) => {
        ds.query(options as any).subscribe({ next: resolve, error: reject });
      });

      const body = getExecuteBody(mockBackend);
      expect(body.query.window.size).toBe(3600);
    });
  });

  describe('error surfacing', () => {
    it('surfaces the upstream error message instead of [object Object]', async () => {
      const rejection = {
        status: 500,
        data: { code: 13, message: 'Unsupported measurement prefix: /cloud' },
      };
      const mockBackend = {
        fetch: jest.fn(() => ({
          subscribe: (handlers: any) => {
            const onError = typeof handlers === 'function' ? undefined : handlers?.error;
            onError?.(rejection);
            return { unsubscribe: () => {} };
          },
        })),
      };
      const ds = createDataSource(mockBackend);

      const options = {
        intervalMs: 60000,
        targets: [
          {
            refId: 'A',
            queryType: UDE_QUERY_TYPE,
            measurement: '/cloud/AWS/ApiGateway',
            dimensions: ['Region'],
            metrics: ['Count'],
            filterGroups: [],
            filterConnector: 'All',
            vizType: VizType.LINE,
            limit: 8,
          },
        ],
        range: {
          from: { valueOf: () => 1700000000000 },
          to: { valueOf: () => 1700003600000 },
        },
        filters: [],
      };

      await expect(
        new Promise<any>((resolve, reject) => {
          ds.query(options as any).subscribe({ next: resolve, error: reject });
        })
      ).rejects.toThrow('Unsupported measurement prefix: /cloud');
    });
  });
});
