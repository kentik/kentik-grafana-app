import { KentikAPI } from './kentik_api';

import * as _ from 'lodash';

type QueryCache = {
  query: { starting_time: string; ending_time: string; [key: string]: any };
  data: [];
  url: string;
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getUTCTimestamp() {
  const ts = new Date();
  return ts.getTime() + ts.getTimezoneOffset() * 60 * 1000;
}

function normalizeQuery(q: any) {
  const query = _.cloneDeep(q);
  query.starting_time = null;
  query.ending_time = null;
  return query;
}

function getHash(q: any) {
  return JSON.stringify(normalizeQuery(q));
}

// Prevent too frequent queries
export function getMaxRefreshInterval(query: any) {
  const interval: any = Date.parse(query.ending_time) - Date.parse(query.starting_time);
  if (interval > ONE_MONTH_MS) {
    return 60 * 60 * 1000; // 1 hour
  } else if (interval > ONE_DAY_MS) {
    return 15 * 60 * 1000; // 15 min
  } else {
    return 5 * 60 * 1000; // 5 min
  }
}

export class KentikProxy {
  cache: Map<string, any>;
  cacheUpdateInterval: number;
  requestCachingIntervals: { '1d': number };

  constructor(private kentikAPISrv: KentikAPI, uid?: string) {
    this.cache = new Map();
    this.cacheUpdateInterval = 5 * 60 * 1000; // 5 min by default
    this.requestCachingIntervals = {
      '1d': 0,
    };
  }

  /** Clear all cached metadata. Call when credentials change or on datasource test/save. */
  async clearCache() {
    this.cache.clear();
  }

  async invokeTopXDataQuery(query: any): Promise<any> {
    query.hostname_lookup = this.hostnameLookupToBoolean(query.hostname_lookup);
    const cachedQuery = _.cloneDeep(query);
    const hash = getHash(cachedQuery);

    if (await this.shouldInvoke(query)) {
      const result = await this.kentikAPISrv.invokeTopXDataQuery(query);

      if (query.hostname_lookup) {
        const resultData = result.results?.[0]?.data;
        if (resultData) {
          resultData.forEach((row: any) => {
            if (row.lookup !== undefined) {
              row.key = row.lookup;
            }
          });
        }
      }

      this.cache.set(hash, {
        query: cachedQuery,
        data: result,
        url: '',
      });

      return { data: result, url: '' };
    } else {
      // Get from cache
      const cached = this.cache.get(hash) as QueryCache | undefined;
      if (!cached) {
        return { data: { results: [{ data: [] }] }, url: '' };
      }
      return { data: cached.data, url: cached.url };
    }
  }

  // Decide, if query should be invoked or get data from cache?
  async shouldInvoke(query: any) {
    const kentikQuery = query;
    const hash = getHash(kentikQuery);
    const timestamp = getUTCTimestamp();

    const startingTime = Date.parse(kentikQuery.starting_time);
    const endingTime = Date.parse(kentikQuery.ending_time);
    const queryRange = endingTime - startingTime;

    const cached = this.cache.get(hash) as QueryCache | undefined;
    const cacheStartingTime = cached ? Date.parse(cached.query.starting_time) : null;
    const cacheEndingTime = cached ? Date.parse(cached.query.ending_time) : null;
    const cachedQueryRange = cacheEndingTime! - cacheStartingTime!;
    const maxRefreshInterval = getMaxRefreshInterval(kentikQuery);

    return (
      !cached ||
      timestamp - endingTime > maxRefreshInterval ||
      (cached &&
        (timestamp - cacheEndingTime! > maxRefreshInterval ||
          startingTime < cacheStartingTime! ||
          Math.abs(queryRange - cachedQueryRange) > 60 * 1000)) // is time range changed?
    );
  }

  async getDevices() {
    const cachedDevices = this.cache.get('devicesPromise');
    if (cachedDevices) {
      return cachedDevices;
    }
    const dataToCache = await this.kentikAPISrv.getDevices();
    this.cache.set('devicesPromise', dataToCache);
    return dataToCache;
  }

  async getSites() {
    const cachedSites = this.cache.get('sitesPromise');
    if (cachedSites) {
      return cachedSites;
    }
    const dataToCache = await this.kentikAPISrv.getSites();
    this.cache.set('sitesPromise', dataToCache);
    return dataToCache;
  }

  async invokeDrilldownUrlQuery(query: any) {
    // Ensure hostname_lookup is a boolean — the /query/url endpoint rejects strings
    const cleanQuery = { ...query, hostname_lookup: this.hostnameLookupToBoolean(query.hostname_lookup) };
    const url = await this.kentikAPISrv.invokeDrilldownUrlQuery(cleanQuery);
    return url;
  }

  async getFieldValues(field: string) {
    let ts = getUTCTimestamp();
    const cachedField = this.cache.get(field) as { ts: number; value: string } | undefined;
    if (cachedField && ts - cachedField.ts < this.cacheUpdateInterval) {
      return cachedField.value;
    } else {
      const result = await this.kentikAPISrv.getFieldValues(field);
      ts = getUTCTimestamp();
      this.cache.set(field, {
        ts: ts,
        value: result,
      });

      return result;
    }
  }

  async getCustomDimensions() {
    const customDimensionsField = 'customDimensions';
    if (!this.cache.get(customDimensionsField)) {
      // Store the promise so concurrent callers await the same in-flight request.
      // On rejection, evict the cached promise so the next call retries.
      const promise = this.kentikAPISrv.getCustomDimensions().then((customDimensions) =>
        customDimensions.map((dimension: any) => ({
          values: this._getDimensionPopulatorsValues(dimension),
          text: `Custom ${dimension.description}`,
          value: dimension.name,
          field: dimension.name,
        }))
      ).catch((err: any) => {
        this.cache.delete(customDimensionsField);
        throw err;
      });
      this.cache.set(customDimensionsField, promise);
    }
    return this.cache.get(customDimensionsField);
  }

  async getSavedFilters() {
    const savedFiltersField = 'savedFilters';
    if (!this.cache.get(savedFiltersField)) {
      // Store the promise so concurrent callers await the same in-flight request.
      // On rejection, evict the cached promise so the next call retries.
      // Note: kentikAPISrv.getSavedFilters() already unwraps `.filters` and returns
      // the flat array, so we map the array directly (not `.filters` on the result).
      const promise = this.kentikAPISrv.getSavedFilters().then((savedFilters) => {
        const filters = Array.isArray(savedFilters) ? savedFilters : [];
        return filters.map((filter: any) => ({
          text: `Saved ${filter.filterName}`,
          field: filter.filterName,
          id: filter.id,
        }));
      }).catch((err: any) => {
        this.cache.delete(savedFiltersField);
        throw err;
      });
      this.cache.set(savedFiltersField, promise);
    }
    return this.cache.get(savedFiltersField);
  }

  /**
   * Returns the unique set of device subtypes for the given device names.
   * If deviceNames is empty or contains only variables ($...), returns an empty array
   * (caller should treat that as "no filtering").
   */
  async getDeviceSubtypes(deviceNames: string[]): Promise<string[]> {
    if (!deviceNames || deviceNames.length === 0) {
      return [];
    }

    // Filter out Grafana template variables — we can't resolve them here
    const concreteNames = deviceNames.filter((n) => !n.startsWith('$'));
    if (concreteNames.length === 0) {
      return [];
    }

    const devices: any[] = await this.getDevices();
    const subtypes = new Set<string>();

    for (const name of concreteNames) {
      const device = devices.find((d: any) => d.deviceName === name || d.device_name === name || String(d.id) === name);
      if (device) {
        const subtype = device.deviceSubType || device.device_subtype || device.deviceSubtype || '';
        if (subtype) {
          subtypes.add(subtype);
        }
      }
    }

    return Array.from(subtypes);
  }

  private _getDimensionPopulatorsValues(dimension: any) {
    return dimension.populators.reduce((values: any, populator: any) => {
      values.push(populator.value);
      return values;
    }, []);
  }

  private hostnameLookupToBoolean(choice: string): boolean {
    return choice === 'enabled' ? true : false;
  }
}
