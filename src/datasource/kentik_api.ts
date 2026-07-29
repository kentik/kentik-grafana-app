import { showAlert } from '../utils/alert_helper';

import { FetchError, BackendSrv } from '@grafana/runtime';

import * as _ from 'lodash';
import { lastValueFrom } from 'rxjs';

const KENTIK_DEVICE_API_BASE = '/device/v202504beta2/device';
const KENTIK_SITE_API_BASE = '/site/v202509/sites';
const KENTIK_USER_API_BASE = '/user/v202211/users';
const KENTIK_CUSTOM_DIMENSIONS_API_BASE = '/custom_dimensions/v202411alpha1';
const KENTIK_SAVED_FILTERS_API_BASE = '/saved-filters/v202501alpha1';
const KENTIK_DICTIONARY_API = '/dictionary/v20260604alpha1';
const KENTIK_QUERY_API = '/query/v20251204alpha1/execute';

export class KentikAPI {
  private baseUrls: string[];
  private activeBaseUrlIndex = 0;
  backendSrv: BackendSrv;
  private batchScheduler: BatchQueryScheduler;
  private email: string;
  private token: string;

  constructor(backendSrv: BackendSrv, uid?: string, proxyBaseUrl?: string, datasourceId?: number, email?: string, token?: string) {
    this.baseUrls = this.buildProxyBaseUrls(uid, proxyBaseUrl, datasourceId);
    this.backendSrv = backendSrv;
    this.email = email || '';
    this.token = token || '';
    this.batchScheduler = new BatchQueryScheduler(this, '/api/v5/query/topXdata');
  }

  private buildProxyBaseUrls(uid?: string, proxyBaseUrl?: string, datasourceId?: number): string[] {
    const candidates = [
      proxyBaseUrl,
      uid ? `/api/datasources/proxy/uid/${uid}` : undefined,
      datasourceId !== undefined ? `/api/datasources/proxy/${datasourceId}` : undefined,
    ].filter((url): url is string => Boolean(url));

    const normalized = candidates.map((url) => url.replace(/\/$/, ''));
    const deduped = Array.from(new Set(normalized));

    // Keep a safe fallback for tests and for edge-cases where Grafana has not
    // yet populated uid/url at construction time.
    if (deduped.length === 0) {
      deduped.push(`/api/datasources/proxy/uid/${uid || ''}`.replace(/\/$/, ''));
    }

    return deduped;
  }

  private isProxyRouteMismatch(error: any): boolean {
    const status = error?.status;
    return status === 404 || status === 405;
  }

  private async requestWithProxyFallback<T>(requestFn: (baseUrl: string) => Promise<T>): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < this.baseUrls.length; attempt++) {
      const index = (this.activeBaseUrlIndex + attempt) % this.baseUrls.length;
      const baseUrl = this.baseUrls[index];
      try {
        const result = await requestFn(baseUrl);
        this.activeBaseUrlIndex = index;
        return result;
      } catch (error: any) {
        lastError = error;
        if (!this.isProxyRouteMismatch(error) || attempt === this.baseUrls.length - 1) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async getDeviceById(deviceId: string): Promise<any> {
    const resp = await this._get(`${KENTIK_DEVICE_API_BASE}/${deviceId}`);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async updateDevice(deviceId: string, data: any): Promise<any> {
    const resp = await this._put(`${KENTIK_DEVICE_API_BASE}/${deviceId}`, data);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async getDevices(): Promise<any> {
    const resp = await this._get(`${KENTIK_DEVICE_API_BASE}?query.noCustomColumns=true`);
    if (resp && resp.devices) {
      return resp.devices;
    } else {
      return [];
    }
  }

  async getSites(): Promise<any> {
    const resp = await this._get(KENTIK_SITE_API_BASE);
    if (resp && resp.sites) {
      return resp.sites;
    } else {
      return [];
    }
  }

  async getUsers(): Promise<any> {
    const requiresAdminLevel = true;
    return this._get(KENTIK_USER_API_BASE, requiresAdminLevel);
  }

  async getFieldValues(field: string): Promise<any> {
    const query = `SELECT DISTINCT ${field} FROM all_devices WHERE i_start_time >= now() - interval '24 hours' ORDER BY ${field} ASC LIMIT 1000`;
    try {
      return await this.invokeSQLQuery(query, true);
    } catch (e: any) {
      if (e.status === 403) {
        return { rows: [] };
      }
      throw e;
    }
  }

  async getCustomDimensions(): Promise<any[]> {
    try {
      const resp = await this._get(KENTIK_CUSTOM_DIMENSIONS_API_BASE, false, true);
      return Array.isArray(resp?.dimensions) ? resp.dimensions : [];
    } catch (e: any) {
      if (e.status === 403) {
        return [];
      }
      throw e;
    }
  }

  async getSavedFilters(): Promise<any> {
    try {
      const data = await this._get(KENTIK_SAVED_FILTERS_API_BASE, false, true);
      return Array.isArray(data?.filters) ? data.filters : Array.isArray(data) ? data : [];
    } catch (e: any) {
      if (e.status === 403) {
        return [];
      }
      throw e;
    }
  }

  /** Fetch the UDE dictionary (measurements, dimensions, metrics, operators). */
  async getDictionary(): Promise<any> {
    return this._get(KENTIK_DICTIONARY_API);
  }

  /** Execute a UDE query via the Query API. */
  async executeQuery(queryPayload: any): Promise<any> {
    return this._post(KENTIK_QUERY_API, queryPayload);
  }

  async invokeTopXDataQuery(query: any): Promise<any> {
    return this.batchScheduler.submit(query);
  }

  /** Direct (non-batched) POST — used internally by BatchQueryScheduler. */
  async invokeBatchDirect(url: string, batchPayload: any): Promise<any> {
    return this._post(url, batchPayload);
  }

  async invokeDrilldownUrlQuery(query: any): Promise<any> {
    const kentikV5Query = {
      version: 4,
      queries: [{ bucket: 'Left +Y Axis', isOverlay: false, query: query }],
    };

    return this._post('/api/v5/query/url', kentikV5Query);
  }

  async invokeSQLQuery(query: any, silentOnForbidden = false): Promise<any> {
    const data = {
      query: query,
    };

    return this._post('/api/v5/query/sql', data, silentOnForbidden);
  }

  private async _get(url: string, requiresAdminLevel = false, silentOnForbidden = false): Promise<any> {
    const requestFn = () =>
      this.requestWithProxyFallback((baseUrl) =>
        lastValueFrom(
          this.backendSrv.fetch<any>({
            method: 'GET',
            url: baseUrl + url,
            showErrorAlert: !requiresAdminLevel && !silentOnForbidden,
            headers: {
              'X-CH-Auth-Email': this.email,
              'X-CH-Auth-API-Token': this.token,
              'Accept': 'application/json',
            },
          })
        ).then((result) => result.data)
      );

    return retry(requestFn, (error: FetchError) => {
      const status = error?.status;
      if (status === 429) {
        showAlert(error);
        return true;
      }
      if (status === 403 && (requiresAdminLevel || silentOnForbidden)) {
        return false;
      }
      showAlert(error);
      return false;
    });
  }

  private async _post(url: string, data: any, silentOnForbidden = false): Promise<any> {
    const requestFn = () =>
      this.requestWithProxyFallback((baseUrl) =>
        lastValueFrom(
          this.backendSrv.fetch<any>({
            method: 'POST',
            url: baseUrl + url,
            data,
            showErrorAlert: !silentOnForbidden,
            headers: {
              'X-CH-Auth-Email': this.email,
              'X-CH-Auth-API-Token': this.token,
              'Accept': 'application/json',
            },
          })
        ).then((result) => result.data)
      );

    return retry(requestFn, (error: FetchError) => {
      // Retry on rate-limit and transient gateway errors
      const status = error?.status;
      if (status === 429 || status === 502) {
        return true;
      }
      if (status === 403 && silentOnForbidden) {
        return false;
      }
      showAlert(error);
      return false;
    });
  }

  private async _put(url: string, data: any): Promise<any> {
    try {
      const resp = await this.requestWithProxyFallback((baseUrl) =>
        lastValueFrom(
          this.backendSrv.fetch<any>({
            method: 'PUT',
            url: baseUrl + url,
            data,
            showErrorAlert: true,
          })
        ).then((result) => result.data)
      );

      if (resp) {
        return resp;
      } else {
        return [];
      }
    } catch (error: any) {
      showAlert(error);
      if (error.err) {
        throw error.err;
      } else {
        throw error;
      }
    }
  }
}

// ── Batch Query Scheduler ──────────────────────────────────────────────────────
// Coalesces individual topXdata queries arriving within a short window into a
// single batched Kentik API call.  Each caller gets back a Promise that resolves
// with its own slice of the response (matched by bucket name).
//
// If the batch call fails, every queued query is retried individually so a
// single bad query doesn't break all panels.

type PendingQuery = {
  bucket: string;
  query: any;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

const BATCH_WINDOW_MS = 250; // ms to wait for more queries before flushing — long enough for Grafana's
                             // staggered panel rendering to settle, short enough to feel responsive.
const MAX_QUERIES_PER_BATCH = 3; // Smaller batches = faster Kentik processing; more parallel HTTP calls
let batchCounter = 0;

export class BatchQueryScheduler {
  private pending: PendingQuery[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: KentikAPI, private endpoint: string) {}

  /** Queue a single query.  Returns a Promise that resolves with the standard
   *  single-query response shape: `{ results: [{ bucket, data }] }`. */
  submit(query: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const bucket = `batch_${++batchCounter}`;
      this.pending.push({ bucket, query, resolve, reject });

      // Reset the flush timer — new query extends the window
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => this.flush(), BATCH_WINDOW_MS);
    });
  }

  private async flush() {
    this.timer = null;
    const all = this.pending.splice(0);
    if (all.length === 0) {
      return;
    }

    // Split into sub-batches of MAX_QUERIES_PER_BATCH and fire them in parallel.
    // This balances: fewer HTTP calls (vs individual) and faster server processing
    // (vs one giant batch).  E.g. 14 queries → 3 parallel batches of 5/5/4.
    const chunks: PendingQuery[][] = [];
    for (let i = 0; i < all.length; i += MAX_QUERIES_PER_BATCH) {
      chunks.push(all.slice(i, i + MAX_QUERIES_PER_BATCH));
    }

    await Promise.all(chunks.map((chunk) => this.executeChunk(chunk)));
  }

  /** Execute a single sub-batch (1–MAX_QUERIES_PER_BATCH queries). */
  private async executeChunk(chunk: PendingQuery[]) {
    const payload = {
      version: 4,
      queries: chunk.map((entry) => ({
        bucket: entry.bucket,
        isOverlay: false,
        query: entry.query,
      })),
    };

    try {
      const resp = await this.api.invokeBatchDirect(this.endpoint, payload);

      // Demux: route each bucket's result back to its caller
      for (const entry of chunk) {
        try {
          entry.resolve(this.extractBucketResult(resp, entry.bucket));
        } catch (err) {
          entry.reject(err);
        }
      }
    } catch (_err) {
      // Sub-batch failed — fall back to individual queries for this chunk
      await this.fallbackIndividual(chunk);
    }
  }

  /** Extract a single bucket's result and wrap it in the standard single-query
   *  response shape so downstream code doesn't need to change. */
  private extractBucketResult(batchResponse: any, bucket: string): any {
    const results = Array.isArray(batchResponse?.results) ? batchResponse.results : [];
    const match = results.find((r: any) => r.bucket === bucket);
    if (!match) {
      // Return empty result set — query returned no data
      return { results: [{ bucket, data: [] }] };
    }
    return { results: [match] };
  }

  /** Fire each query individually — used when the batch call fails. */
  private async fallbackIndividual(batch: PendingQuery[]) {
    const tasks = batch.map(async (entry) => {
      try {
        const payload = {
          version: 4,
          queries: [{ bucket: entry.bucket, isOverlay: false, query: entry.query }],
        };
        const resp = await this.api.invokeBatchDirect(this.endpoint, payload);
        entry.resolve(this.extractBucketResult(resp, entry.bucket));
      } catch (err) {
        entry.reject(err);
      }
    });
    await Promise.allSettled(tasks);
  }
}

const retry = (fn: Function, shouldContinue: (error: FetchError) => boolean, retriesLeft = 5, interval = 2000) =>
  new Promise((resolve, reject) => {
    fn()
      .then(resolve)
      .catch((error: FetchError) => {
        if (!shouldContinue(error)) {
          reject(error);
          return;
        }
        if (retriesLeft === 0) {
          showAlert('Maximum number of retries exceeded, please reload the page');
          reject(error);
          return;
        }
        setTimeout(() => {
          // Passing on "reject" is the important part
          retry(fn, shouldContinue, retriesLeft - 1, interval * 2).then(resolve, reject);
        }, interval);
      });
  });
