import { DictionaryService, MeasurementFamily } from '../dictionary_service';

const MOCK_DICTIONARY = {
  measurements: [
    {
      name: '/traffic',
      display_name: 'Traffic',
      family: MeasurementFamily.TRAFFIC,
      description: 'Network traffic data',
      dimensions: [
        { key: 'src_geo_city', label: 'Source City', data_type: 'STRING', category: 'Geography', column: 'src_geo_city', direction: 'src', inverse: 'dst_geo_city', values: {}, operator_set_key: 'STRING', filter_only: false, filter_column: '', query_column: '' },
        { key: 'dst_geo_city', label: 'Destination City', data_type: 'STRING', category: 'Geography', column: 'dst_geo_city', direction: 'dst', inverse: 'src_geo_city', values: {}, operator_set_key: 'STRING', filter_only: false, filter_column: '', query_column: '' },
      ],
      metrics: [
        { key: 'avg_bits_per_sec', label: 'Bits/s', data_type: 'FLOAT', category: 'Throughput', column: 'f_sum_both_bytes', direction: 'bi', inverse: '', values: {}, window_fn: 'avg', aggregate_fn: 'sum', expression: '', depends_on: [], to_bits: true, rollup: true, healthy_value: '', family_key: 'throughput', base_unit: 'BITS_PER_SECOND' },
      ],
    },
    {
      name: '/nms/device_metrics',
      display_name: 'NMS Device Metrics',
      family: MeasurementFamily.NMS,
      description: 'NMS device-level metrics',
      dimensions: [],
      metrics: [],
    },
  ],
  operator_sets: [
    { key: 'STRING', operators: [{ key: '=', label: 'equals' }, { key: '!=', label: 'not equals' }] },
  ],
  metric_families: [
    { key: 'throughput', label: 'Throughput', quantity: 1, base_unit: 1, dual_axis_compatible: [], incompatible_with: [] },
  ],
};

describe('DictionaryService', () => {
  let mockApi: any;
  let service: DictionaryService;

  beforeEach(() => {
    mockApi = { getDictionary: jest.fn().mockResolvedValue(MOCK_DICTIONARY) };
    service = new DictionaryService(mockApi);
  });

  it('fetches and caches the dictionary', async () => {
    const dict = await service.getDictionary();
    expect(dict.measurements).toHaveLength(2);
    expect(dict.operator_sets).toHaveLength(1);
    expect(dict.metric_families).toHaveLength(1);

    // Second call should use cache
    await service.getDictionary();
    expect(mockApi.getDictionary).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent fetches', async () => {
    const [a, b, c] = await Promise.all([
      service.getDictionary(),
      service.getDictionary(),
      service.getDictionary(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockApi.getDictionary).toHaveBeenCalledTimes(1);
  });

  it('getMeasurements returns all measurements', async () => {
    const measurements = await service.getMeasurements();
    expect(measurements).toHaveLength(2);
    expect(measurements[0].name).toBe('/traffic');
  });

  it('getMeasurement finds by name', async () => {
    const m = await service.getMeasurement('/traffic');
    expect(m?.display_name).toBe('Traffic');
  });

  it('getMeasurement returns undefined for unknown', async () => {
    const m = await service.getMeasurement('/unknown');
    expect(m).toBeUndefined();
  });

  it('getMeasurementsByFamily filters correctly', async () => {
    const traffic = await service.getMeasurementsByFamily(MeasurementFamily.TRAFFIC);
    expect(traffic).toHaveLength(1);
    expect(traffic[0].name).toBe('/traffic');

    const nms = await service.getMeasurementsByFamily(MeasurementFamily.NMS);
    expect(nms).toHaveLength(1);
    expect(nms[0].name).toBe('/nms/device_metrics');
  });

  it('getDimensions returns dimensions for a measurement', async () => {
    const dims = await service.getDimensions('/traffic');
    expect(dims).toHaveLength(2);
    expect(dims[0].key).toBe('src_geo_city');
  });

  it('getMetrics returns metrics for a measurement', async () => {
    const metrics = await service.getMetrics('/traffic');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].key).toBe('avg_bits_per_sec');
  });

  it('invalidateCache forces re-fetch', async () => {
    await service.getDictionary();
    expect(mockApi.getDictionary).toHaveBeenCalledTimes(1);

    service.invalidateCache();
    await service.getDictionary();
    expect(mockApi.getDictionary).toHaveBeenCalledTimes(2);
  });

  it('handles API errors gracefully', async () => {
    mockApi.getDictionary.mockRejectedValueOnce(new Error('Network error'));
    await expect(service.getDictionary()).rejects.toThrow('Network error');

    // Should retry after error (not stuck in failed promise)
    mockApi.getDictionary.mockResolvedValueOnce(MOCK_DICTIONARY);
    const dict = await service.getDictionary();
    expect(dict.measurements).toHaveLength(2);
  });

  it('handles empty/malformed response', async () => {
    mockApi.getDictionary.mockResolvedValueOnce({});
    const dict = await service.getDictionary();
    expect(dict.measurements).toEqual([]);
    expect(dict.operator_sets).toEqual([]);
    expect(dict.metric_families).toEqual([]);
  });
});
