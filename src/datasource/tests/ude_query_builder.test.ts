import {
  buildExecuteQueryRequest,
  VizType,
  GrafanaUDEQuery,
} from '../ude_query_builder';

describe('UDE Query Builder', () => {
  const baseQuery: GrafanaUDEQuery = {
    measurement: '/traffic',
    dimensions: ['src_geo_city', 'dst_geo_city'],
    metrics: ['bytes', 'packets'],
    timeRange: { from: 1710028800000, to: 1710032400000 }, // epoch ms
    limit: 10,
  };

  it('builds a minimal query with required fields', () => {
    const req = buildExecuteQueryRequest(baseQuery);

    expect(req.query.measurement).toBe('/traffic');
    expect(req.query.dimensions).toHaveLength(2);
    expect(req.query.dimensions[0].name).toBe('src_geo_city');
    expect(req.query.metrics).toHaveLength(2);
    expect(req.query.metrics[0].name).toBe('bytes');
    expect(req.query.time.start).toBe(1710028800);
    expect(req.query.time.end).toBe(1710032400);
    expect(req.query.time.lookback).toBe(0);
    expect(req.query.viz.type).toBe(VizType.LINE);
    expect(req.query.viz.limit).toBe(10);
    expect(req.application_metadata.name).toBe('kentik-grafana-plugin');
    expect(req.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not include filters when none provided', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.filters).toBeUndefined();
  });

  it('does not include window when not set', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.window).toBeUndefined();
  });

  it('does not include rollups when not set', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.rollups).toBeUndefined();
  });

  it('does not include sort when not set', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.sort).toBeUndefined();
  });

  it('includes CIDR when specified', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, cidr: 24, cidr6: 64 });
    expect(req.query.dimensions[0].cidr).toBe(24);
    expect(req.query.dimensions[0].cidr6).toBe(64);
  });

  it('does not include CIDR fields when not specified', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.dimensions[0].cidr).toBeUndefined();
    expect(req.query.dimensions[0].cidr6).toBeUndefined();
  });

  it('includes filters when provided', () => {
    const query: GrafanaUDEQuery = {
      ...baseQuery,
      filterGroups: [
        {
          connector: 'All',
          not: false,
          filters: [
            { filter_field: 'src_geo_city', operator: '=', filter_value: 'Seattle' },
          ],
        },
      ],
      filterConnector: 'All',
    };
    const req = buildExecuteQueryRequest(query);
    expect(req.query.filters).toBeDefined();
    expect(req.query.filters!.dimensions!.filter_groups).toHaveLength(1);
    expect(req.query.filters!.dimensions!.filter_groups[0].filters[0].filter_value).toBe('Seattle');
  });

  it('includes window when windowSize is set', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, windowSize: 300 });
    expect(req.query.window).toEqual({ size: 300 });
  });

  it('does not include window when windowSize is 0', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, windowSize: 0 });
    expect(req.query.window).toBeUndefined();
  });

  it('includes rollups when provided', () => {
    const req = buildExecuteQueryRequest({
      ...baseQuery,
      rollups: [{ metric: 'bytes', fn: 'sum' }, { metric: 'packets', fn: 'avg' }],
    });
    expect(req.query.rollups).toHaveLength(2);
    expect(req.query.rollups![0]).toEqual({ metric: 'bytes', fn: 'sum' });
  });

  it('includes sort when sortBy is set', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, sortBy: 'bytes', sortOrder: 'asc' });
    expect(req.query.sort).toEqual([{ rollup: 'bytes', order: 'asc' }]);
  });

  it('defaults sort order to desc', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, sortBy: 'packets' });
    expect(req.query.sort![0].order).toBe('desc');
  });

  it('uses custom viz type', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, vizType: VizType.TABLE });
    expect(req.query.viz.type).toBe(VizType.TABLE);
  });

  it('defaults viz type to LINE', () => {
    const req = buildExecuteQueryRequest(baseQuery);
    expect(req.query.viz.type).toBe(VizType.LINE);
  });

  it('defaults limit to 8 when not provided', () => {
    const { limit, ...noLimit } = baseQuery;
    const req = buildExecuteQueryRequest(noLimit as GrafanaUDEQuery);
    expect(req.query.viz.limit).toBe(8);
  });

  it('converts Grafana epoch ms to epoch seconds for time range', () => {
    const req = buildExecuteQueryRequest({
      ...baseQuery,
      timeRange: { from: 1710028800123, to: 1710032400456 },
    });
    expect(req.query.time.start).toBe(1710028800);
    expect(req.query.time.end).toBe(1710032400);
  });

  it('generates unique request IDs', () => {
    const req1 = buildExecuteQueryRequest(baseQuery);
    const req2 = buildExecuteQueryRequest(baseQuery);
    expect(req1.request_id).not.toBe(req2.request_id);
  });

  it('handles empty dimensions array', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, dimensions: [] });
    expect(req.query.dimensions).toEqual([]);
  });

  it('handles empty metrics array', () => {
    const req = buildExecuteQueryRequest({ ...baseQuery, metrics: [] });
    expect(req.query.metrics).toEqual([]);
  });
});
