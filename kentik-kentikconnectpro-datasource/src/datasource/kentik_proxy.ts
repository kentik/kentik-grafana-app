/* eslint-disable */
import { KentikAPI } from './kentik_api';

import * as _ from 'lodash';
import * as moment from 'moment';

import localforage from "localforage";

type QueryCache = {
  query: {starting_time: string, ending_time: string, [key: string]: any,}, 
  data: [],
  url: string,
}

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
  if (interval > moment.duration(1, 'months')) {
    return 60 * 60 * 1000; // 1 hour
  } else if (interval > moment.duration(1, 'day')) {
    return 15 * 60 * 1000; // 15 min
  } else {
    return 5 * 60 * 1000; // 5 min
  }
}

export class KentikProxy {
  cache = localforage.createInstance({
    name: "kentikCache"
  });
  cacheUpdateInterval: number;
  requestCachingIntervals: { '1d': number };

  constructor(private kentikAPISrv: KentikAPI) {
    this.cacheUpdateInterval = 5 * 60 * 1000; // 5 min by default
    this.requestCachingIntervals = {
      '1d': 0,
    };
  }

  async invokeTopXDataQuery(query: any): Promise<any> {
    query.hostname_lookup = this.hostnameLookupToBoolean(query.hostname_lookup);
    const cachedQuery = _.cloneDeep(query);
    const hash = getHash(cachedQuery);

    if (await this.shouldInvoke(query)) {
      // Invoke query
      const result = await this.kentikAPISrv.invokeTopXDataQuery(query);
      const url = await this.kentikAPISrv.invokeDrilldownUrlQuery(query);

      if (query.hostname_lookup) {
        const resultData = result.results[0].data;
        resultData.forEach((row: any) => {
          if (row.lookup !== undefined) {
            row.key = row.lookup;
          }
        });
      }

      await this.cache.setItem(hash, {
        query: cachedQuery,
        data: result,
        url: url,
      });
      return {data: result, url};
    } else {
      // Get from cache
      const cached = await this.cache.getItem<QueryCache>(hash); 
      return cached && {data: cached.data, url: cached.url};
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

    const cached = await this.cache.getItem<QueryCache>(hash); 
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
    const cachedDevices = await this.cache.getItem('devicesPromise');
    if (!!cachedDevices) {
      return cachedDevices;
    }
    const dataToCache = await this.kentikAPISrv.getDevices();
    this.cache.setItem('devicesPromise', await this.kentikAPISrv.getDevices());
    return dataToCache;
  }

  async getSites() {
    const cachedSites = await this.cache.getItem('sitesPromise');
    if (!!cachedSites) {
      return cachedSites;
    }
    const dataToCache = await this.kentikAPISrv.getSites();
    this.cache.setItem('sitesPromise', dataToCache);
    return dataToCache;
  }

  async invokeDrilldownUrlQuery(query: any) {
    const url = await this.kentikAPISrv.invokeDrilldownUrlQuery(query);
    return url;
  }

  async getFieldValues(field: string) {
    let ts = getUTCTimestamp();
    const cachedField = await this.cache.getItem<{ ts: number, value: string }>(field);
    if (!!cachedField && ts - cachedField.ts < this.cacheUpdateInterval) {
      return cachedField.value;
    } else {
      const result = await this.kentikAPISrv.getFieldValues(field);
      ts = getUTCTimestamp();
      this.cache.setItem(field, {
        ts: ts,
        value: result,
      });

      return result;
    }
  }

  // TODO to verify if it works correclty when customDimenstion endpoint will be ready
  async getCustomDimensions() {
    const customDimensionsField = 'customDimensions';
    if (!await this.cache.getItem(customDimensionsField)) {
      const customDimensions = await this.kentikAPISrv.getCustomDimensions();
      this.cache.setItem(customDimensionsField, customDimensions.map((dimension: any) => ({
        values: this._getDimensionPopulatorsValues(dimension),
        text: `Custom ${dimension.display_name}`,
        value: dimension.name,
        field: dimension.name,
      })));
    }
    return this.cache.getItem(customDimensionsField);
  }

  async getSavedFilters() {
    const savedFiltersField = 'savedFilters';
    if (!await this.cache.getItem(savedFiltersField)) {
      const savedFilters = await this.kentikAPISrv.getSavedFilters();
      this.cache.setItem(savedFiltersField, _.map(savedFilters.filters, (filter) => ({
        text: `Saved ${filter.filterName}`,
        field: filter.filterName,
        id: filter.id,
      })));
    }
    return await this.cache.getItem(savedFiltersField);
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
