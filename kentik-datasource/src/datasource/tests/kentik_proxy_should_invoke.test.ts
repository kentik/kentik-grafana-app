import { KentikProxy, getUTCTimestamp, getMaxRefreshInterval } from '../kentik_proxy';

jest.mock('../kentik_proxy', () => {
    const actual = jest.requireActual('../kentik_proxy');
    return {
        ...actual,
        getUTCTimestamp: jest.fn(),
        getMaxRefreshInterval: jest.fn(),
    };
});

describe('KentikProxy.shouldInvoke', () => {
    let proxy: KentikProxy;

    const mockApi = {
        invokeTopXDataQuery: jest.fn(),
    } as any;

    const baseQuery = {
        starting_time: '2025-01-01T00:00:00Z',
        ending_time: '2025-01-01T01:00:00Z',
    };

    beforeEach(() => {
        proxy = new KentikProxy(mockApi);
        jest.clearAllMocks();
    });

    it('returns true when there is no cached entry', async () => {
        jest.spyOn(proxy.cache, 'get').mockReturnValue(undefined);
        const result = await proxy.shouldInvoke(baseQuery);
        expect(result).toBe(true);
    });

    it('returns false when cached entry exists and is fresh', async () => {
        const baseQuery = {
            starting_time: '2025-01-01T00:00:00Z',
            ending_time: new Date(Date.now() - 60 * 1000).toISOString(),
        };

        const cachedQuery = {
            query: baseQuery,
            data: { ok: true },
        };

        jest.spyOn(proxy.cache, 'get').mockReturnValue(cachedQuery);

        // current time = ending_time + 1s
        (getUTCTimestamp as jest.Mock).mockReturnValue(Date.parse(baseQuery.ending_time) + 1000);

        // maxRefreshInterval = 10 min
        (getMaxRefreshInterval as jest.Mock).mockReturnValue(10 * 60 * 1000);

        const result = await proxy.shouldInvoke(baseQuery);
        expect(result).toBe(false);
    });

    it('returns true when cached entry is older than maxRefreshInterval', async () => {
        const cachedQuery = {
            query: baseQuery,
            data: {},
        };

        jest.spyOn(proxy.cache, 'get').mockReturnValue(cachedQuery);

        // current time = ending_time + 2h
        (getUTCTimestamp as jest.Mock).mockReturnValue(Date.parse(baseQuery.ending_time) + 2 * 3600 * 1000);

        // maxRefreshInterval = 10 min
        (getMaxRefreshInterval as jest.Mock).mockReturnValue(10 * 60 * 1000);

        const result = await proxy.shouldInvoke(baseQuery);
        expect(result).toBe(true);
    });

    it('returns true when query time range changed more than 60s', async () => {
        const cachedQuery = {
            query: baseQuery,
            data: {},
        };

        jest.spyOn(proxy.cache, 'get').mockReturnValue(cachedQuery);

        // changed query range: 3h instead of 1h
        const modifiedQuery = {
            starting_time: '2025-01-01T00:00:00Z',
            ending_time: '2025-01-01T03:00:00Z',
        };

        // current time = ending_time + 1s
        (getUTCTimestamp as jest.Mock).mockReturnValue(Date.parse(baseQuery.ending_time) + 1000);
        (getMaxRefreshInterval as jest.Mock).mockReturnValue(10 * 60 * 1000);

        const result = await proxy.shouldInvoke(modifiedQuery);
        expect(result).toBe(true);
    });

    it('returns true when query starting time is earlier than cached starting time', async () => {
        const cachedQuery = {
            query: baseQuery,
            data: {},
        };

        jest.spyOn(proxy.cache, 'get').mockReturnValue(cachedQuery);

        const modifiedQuery = {
            starting_time: '2024-12-31T23:00:00Z', // start earlier
            ending_time: '2025-01-01T01:00:00Z',
        };

        (getUTCTimestamp as jest.Mock).mockReturnValue(Date.parse(baseQuery.ending_time) + 1000);
        (getMaxRefreshInterval as jest.Mock).mockReturnValue(10 * 60 * 1000);

        const result = await proxy.shouldInvoke(modifiedQuery);
        expect(result).toBe(true);
    });
});
