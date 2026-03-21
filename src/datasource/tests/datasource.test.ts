import { DataSource, derivePortalUrl } from '../DataSource';
import { lastValueFrom } from 'rxjs';

describe('derivePortalUrl', () => {
  it('returns US portal for default region', () => {
    expect(derivePortalUrl('default')).toBe('https://portal.kentik.com');
  });

  it('returns EU portal for eu region', () => {
    expect(derivePortalUrl('eu')).toBe('https://portal.kentik.eu');
  });

  it('strips api. prefix for custom region', () => {
    expect(derivePortalUrl('custom', 'https://api.acme.com')).toBe('https://portal.acme.com');
  });

  it('strips grpc.api. prefix for custom region', () => {
    expect(derivePortalUrl('custom', 'https://grpc.api.acme.com')).toBe('https://portal.acme.com');
  });

  it('keeps host as-is when no api. prefix (on-prem)', () => {
    expect(derivePortalUrl('custom', 'https://kentik.internal')).toBe('https://kentik.internal');
  });

  it('falls back to v5 URL when dynamicUrl is empty', () => {
    expect(derivePortalUrl('custom', '', { v5: 'https://api.onprem.example.com' })).toBe('https://portal.onprem.example.com');
  });

  it('falls back to kentik.com when custom has no URL at all', () => {
    expect(derivePortalUrl('custom')).toBe('https://portal.kentik.com');
  });
});

describe('DataSource', () => {
  const ctx: any = {};

  const data = {
    dimensions: [
      {
        description: 'just-testing',
        name: 'c_test',
        populators: [{ value: 'value1' }, { value: 'value2' }],
      },
      {
        description: 'just-testing-2',
        name: 'c_test_2',
        populators: [{ value: 'value3' }, { value: 'value4' }],
      },
    ],
    rows: [{ src_geo_city: 'city' }],
  };
  beforeEach(() => {
    createDatasourceInstance(ctx, data);
  });

  describe('When querying Kentik data', () => {
    it('Should return tag values for default dimensions', async () => {
      const tagValues = await ctx.ds.getTagValues({ key: 'Source City' });
      expect(tagValues).toHaveLength(1);
      expect(tagValues[0]).toEqual({ text: 'city' });
    });

    it('Should return tag values for custom dimensions', async () => {
      const tagValues = await ctx.ds.getTagValues({ key: 'Custom just-testing-2' });
      expect(tagValues).toHaveLength(2);
      expect(tagValues[0]).toEqual({ text: 'value3' });
      expect(tagValues[1]).toEqual({ text: 'value4' });
    });
  });
});

describe('applyAliasPattern', () => {
  const ctx: any = {};

  const series = {
    key: '1.1.1.1',
    src_as: 'AS123',
    dst_as: 'AS456',
  };

  const query = {
    aggregates: [{ name: 'bps' }],
    aggregateTypes: ['bps'],
  };

  beforeEach(() => {
    createDatasourceInstance(ctx, {});
    ctx.ds.templateSrv = {
      replace: jest.fn((value: string) => value),
    };
  });

  it('returns default alias when aliasBy is not provided', () => {
    const target = {
      prefix: 'Traffic',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('Traffic 1.1.1.1 (bps)');
  });

  it('replaces $tag_* variables from series', () => {
    const target = {
      aliasBy: '$tag_src_as → $tag_dst_as',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('AS123 → AS456');
  });

  it('replaces $col with aggregate name', () => {
    const target = {
      aliasBy: 'metric: $col',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('metric: bps');
  });

  it('adds prefix before alias', () => {
    const target = {
      aliasBy: '$tag_src_as',
      prefix: 'IN',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('IN AS123');
  });

  it('keeps $tag placeholder when value is missing', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const target = {
      aliasBy: '$tag_missing',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('$tag_missing');
    jest.restoreAllMocks();
  });

  it('replaces {{property}} variables from series', () => {
    const target = {
      aliasBy: '{{src_as}} → {{dst_as}}',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('AS123 → AS456');
  });

  it('supports mixed $tag_ and {{}} syntax', () => {
    const target = {
      aliasBy: '{{src_as}} in $tag_dst_as',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe('AS123 in AS456');
  });

  describe('Robustness', () => {
    const robustQuery = {
      dimension: ['InterfaceID_src', 'i_device_name'],
      aggregates: [{ name: 'bps' }],
      aggregateTypes: ['bps'],
    };

    it('should match by ID (case-insensitive)', () => {
      const series = { interfaceid_src: 'eth1' };
      const target = { aliasBy: '$tag_InterfaceID_src' };
      expect(ctx.ds.applyAliasPattern(series, robustQuery, target)).toBe('eth1');
    });

    it('should match by Label using {{}}', () => {
      const series = { InterfaceID_src: 'eth2' };
      const target = { aliasBy: '{{Source Interface}}' };
      expect(ctx.ds.applyAliasPattern(series, robustQuery, target)).toBe('eth2');
    });

    it('should extract from series.key using ID', () => {
      const series = { key: 'eth3,router1' };
      const target = { aliasBy: '$tag_InterfaceID_src' };
      expect(ctx.ds.applyAliasPattern(series, robustQuery, target)).toBe('eth3');
    });

    it('should extract second dimension from series.key', () => {
      const series = { key: 'eth5,router3' };
      const target = { aliasBy: '$tag_i_device_name' };
      expect(ctx.ds.applyAliasPattern(series, robustQuery, target)).toBe('router3');
    });

    it('should handle curly brace syntax {{tagName}} with labels', () => {
      const series = { key: 'eth8,router6' };
      const target = { aliasBy: '{{Source Interface}} on {{i_device_name}}' };
      expect(ctx.ds.applyAliasPattern(series, robustQuery, target)).toBe('eth8 on router6');
    });
  });

  describe('query method', () => {
    it('Should correctly format dimensions when provided as array of strings', async () => {
      const invokeSpy = jest.spyOn(ctx.ds.kentik, 'invokeTopXDataQuery');
      invokeSpy.mockResolvedValue({ 
        data: { results: [{ data: [] }] }, 
        url: 'mock_url' 
      });

      const options: any = {
        targets: [
          {
            metric: 'avg_bits_per_sec',
            dimension: ['src_endpoint', 'dst_endpoint'], // Array of strings
            devices: 'device1',
          },
        ],
        range: {
          from: { utc: () => ({ format: () => 'now-1h' }) },
          to: { utc: () => ({ format: () => 'now' }) },
        },
        scopedVars: {},
      };

      await lastValueFrom(ctx.ds.query(options));

      const calledQuery: any = invokeSpy.mock.calls[0][0];
      expect(calledQuery.dimension).toEqual(['src_endpoint', 'dst_endpoint']);
    });

    it('Should correctly format dimensions when provided as array of objects', async () => {
      const invokeSpy = jest.spyOn(ctx.ds.kentik, 'invokeTopXDataQuery');
      invokeSpy.mockResolvedValue({ 
        data: { results: [{ data: [] }] }, 
        url: 'mock_url' 
      });

      const options: any = {
        targets: [
          {
            metric: 'avg_bits_per_sec',
            dimension: [{ value: 'src_endpoint' }, { value: 'dst_endpoint' }], // object[] format
            devices: 'device1',
            mode: 'graph',
          }
        ],
        range: {
          from: { utc: () => ({ format: () => 'now-1h' }) },
          to: { utc: () => ({ format: () => 'now' }) },
        },
        scopedVars: {},
      };

      await lastValueFrom(ctx.ds.query(options));

      const calledQuery: any = invokeSpy.mock.calls[0][0];
      expect(calledQuery.dimension).toEqual(['src_endpoint', 'dst_endpoint']);
    });
  });
});


function createDatasourceInstance(ctx: any, data: any) {
  ctx.instanceSettings = {};
  ctx.backendSrv = {
    get: () => {
      return Promise.resolve([
        {
          type: 'kentik-connect-datasource',
          jsonData: {
            region: 'default',
          },
        },
      ]);
    },
    fetch: () => {
      return {
        toPromise: () =>
          Promise.resolve({
            status: 200,
            data,
          }),
        subscribe: (observer: any) => {
          observer.next({
            status: 200,
            data,
          });
          observer.complete();
        },
      };
    },
    post: (payload: any) => {
      return Promise.resolve({
        status: 200,
        ...data,
      });
    },
  };

  // @ts-ignore
  ctx.ds = new DataSource(ctx.instanceSettings, ctx.backendSrv);
}
