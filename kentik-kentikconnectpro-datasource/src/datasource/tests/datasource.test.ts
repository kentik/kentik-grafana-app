import { DataSource } from '../DataSource';

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

    expect(result).toBe(' AS123 → AS456');
  });

  it('replaces $col with aggregate name', () => {
    const target = {
      aliasBy: 'metric: $col',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe(' metric: bps');
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
    const target = {
      aliasBy: '$tag_missing',
      prefix: '',
    };

    const result = ctx.ds.applyAliasPattern(series, query, target);

    expect(result).toBe(' $tag_missing');
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
