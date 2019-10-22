import { KentikAPI } from './kentikAPI';
import { Datasource } from './module';
import { KentikProxy } from './kentikProxy';

describe('KentikDatasource', () => {
  const ctx: any = {};

  const data = {
    customDimensions: [
      {
        display_name: 'just-testing',
        name: 'c_test',
        populators: [{ value: 'value1' }, { value: 'value2' }],
      },
      {
        display_name: 'just-testing-2',
        name: 'c_test_2',
        populators: [{ value: 'value3' }, { value: 'value4' }],
      },
    ],
    rows: [{ src_geo_city: 'city' }],
  };
  beforeEach(() => createDatasourceInstance(ctx, data));

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

function createDatasourceInstance(ctx: any, data: any) {
  ctx.instanceSettings = {};
  ctx.templateSrv = {};
  ctx.backendSrv = {
    get: () => {
      return Promise.resolve([
        {
          type: 'kentik-ds',
          jsonData: {
            region: 'default',
          },
        },
      ]);
    },
    datasourceRequest: () => {
      return Promise.resolve({
        status: 200,
        data,
      });
    },
  };
  ctx.$http = () => {
    return Promise.resolve({
      status: 200,
      data,
    });
  };

  ctx.kentikAPI = new KentikAPI(ctx.backendSrv, ctx.$http);
  ctx.kentikAPI.setRegion('default');

  ctx.kentikProxy = new KentikProxy(ctx.kentikAPI);

  ctx.ds = new Datasource(ctx.instanceSettings, ctx.templateSrv, ctx.kentikProxy);
}
