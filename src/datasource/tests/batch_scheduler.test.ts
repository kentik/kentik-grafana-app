import { BatchQueryScheduler, KentikAPI } from '../kentik_api';

describe('BatchQueryScheduler', () => {
  let scheduler: BatchQueryScheduler;
  let mockApi: jest.Mocked<Pick<KentikAPI, 'invokeBatchDirect'>>;
  let capturedPayloads: any[];

  beforeEach(() => {
    jest.useFakeTimers();
    capturedPayloads = [];

    mockApi = {
      invokeBatchDirect: jest.fn(async (_url: string, payload: any) => {
        capturedPayloads.push(payload);
        // Echo back results keyed by the bucket names in the request
        return {
          results: payload.queries.map((q: any) => ({
            bucket: q.bucket,
            data: [{ key: `result_for_${q.bucket}`, value: 42 }],
          })),
        };
      }),
    };

    scheduler = new BatchQueryScheduler(mockApi as any, '/api/v5/query/topXdata');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('batches multiple queries submitted within the coalescing window', async () => {
    const p1 = scheduler.submit({ dimension: ['IP_src'], metric: ['bytes'] });
    const p2 = scheduler.submit({ dimension: ['Proto'], metric: ['bytes'] });
    const p3 = scheduler.submit({ dimension: ['Port_dst'], metric: ['bytes'] });

    // Advance past the batch window
    jest.advanceTimersByTime(300);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Should have made exactly 1 API call
    expect(mockApi.invokeBatchDirect).toHaveBeenCalledTimes(1);

    // That call should contain all 3 queries
    expect(capturedPayloads[0].queries).toHaveLength(3);
    expect(capturedPayloads[0].version).toBe(4);

    // Each result should be wrapped in single-query response format
    expect(r1.results).toHaveLength(1);
    expect(r2.results).toHaveLength(1);
    expect(r3.results).toHaveLength(1);

    // Each result should have data
    expect(r1.results[0].data).toHaveLength(1);
    expect(r2.results[0].data).toHaveLength(1);
    expect(r3.results[0].data).toHaveLength(1);
  });

  it('sends a single query without batching overhead', async () => {
    const p1 = scheduler.submit({ dimension: ['IP_src'], metric: ['bytes'] });

    jest.advanceTimersByTime(300);

    const r1 = await p1;

    expect(mockApi.invokeBatchDirect).toHaveBeenCalledTimes(1);
    expect(capturedPayloads[0].queries).toHaveLength(1);
    expect(r1.results).toHaveLength(1);
  });

  it('falls back to individual queries when batch fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let callCount = 0;
    mockApi.invokeBatchDirect.mockImplementation(async (_url: string, payload: any) => {
      callCount++;
      if (callCount === 1) {
        // First call (batch) fails
        throw new Error('batch failed');
      }
      // Individual fallback calls succeed
      return {
        results: payload.queries.map((q: any) => ({
          bucket: q.bucket,
          data: [{ key: 'fallback', value: 1 }],
        })),
      };
    });

    const p1 = scheduler.submit({ dimension: ['IP_src'] });
    const p2 = scheduler.submit({ dimension: ['Proto'] });

    jest.advanceTimersByTime(300);

    const [r1, r2] = await Promise.all([p1, p2]);

    // 1 batch call + 2 individual fallbacks = 3 total
    expect(mockApi.invokeBatchDirect).toHaveBeenCalledTimes(3);

    // Both should have results from fallback
    expect(r1.results[0].data[0].key).toBe('fallback');
    expect(r2.results[0].data[0].key).toBe('fallback');

    jest.restoreAllMocks();
  });

  it('assigns unique bucket IDs to each query', async () => {
    scheduler.submit({ dimension: ['A'] });
    scheduler.submit({ dimension: ['B'] });

    jest.advanceTimersByTime(300);

    // Wait for the flush async to complete
    await Promise.resolve();
    await Promise.resolve();

    const buckets = capturedPayloads[0].queries.map((q: any) => q.bucket);
    expect(buckets[0]).not.toEqual(buckets[1]);
    expect(buckets[0]).toMatch(/^batch_\d+$/);
    expect(buckets[1]).toMatch(/^batch_\d+$/);
  });
});
