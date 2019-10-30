import { KentikAPI } from './kentik_api';
import { KentikProxy } from './kentik_proxy';

describe('KentikProxy', () => {
  const ctx: any = {};

  describe('When getting custom dimensions', () => {
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
    };
    beforeEach(() => getKentikProxyInstance(ctx, data));

    it('Should parse it properly', async () => {
      const dimensions = await ctx.kentikProxy.getCustomDimensions();
      expect(dimensions).toHaveLength(2);
      expect(dimensions[0]).toEqual({
        text: 'Custom just-testing',
        value: 'c_test',
        field: 'c_test',
        values: ['value1', 'value2'],
      });
      expect(dimensions[1]).toEqual({
        text: 'Custom just-testing-2',
        value: 'c_test_2',
        field: 'c_test_2',
        values: ['value3', 'value4'],
      });
    });
  });
});

function getKentikProxyInstance(ctx: any, data: any) {
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
}
