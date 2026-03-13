import { showAlert } from '../utils/alert_helper';

import { FetchError, BackendSrv } from '@grafana/runtime';

import * as _ from 'lodash';
import { lastValueFrom } from 'rxjs';

export class KentikAPI {
  baseUrl: string;
  backendSrv: BackendSrv;

  constructor(backendSrv: BackendSrv, uid: string) {
    this.baseUrl = `/api/datasources/proxy/uid/${uid}`;
    this.backendSrv = backendSrv;
  }

  async getDeviceById(deviceId: string): Promise<any> {
    const resp = await this._get(`/device/v202308beta1/device/${deviceId}`);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async updateDevice(deviceId: string, data: any): Promise<any> {
    const resp = await this._put(`/device/v202308beta1/device/${deviceId}`, data);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async getDevices(): Promise<any> {
    const resp = await this._get('/device/v202308beta1/device');
    if (resp && resp.devices) {
      return resp.devices;
    } else {
      return [];
    }
  }

  async getSites(): Promise<any> {
    const resp = await this._get('/site/v202509/sites');
    if (resp && resp.sites) {
      return resp.sites;
    } else {
      return [];
    }
  }

  async getUsers(): Promise<any> {
    const requiresAdminLevel = true;
    return this._get('/user/v202211/users', requiresAdminLevel);
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
      const resp = await this._get('/custom_dimensions/v202411alpha1', false, true);
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
      const data = await this._get('/saved-filters/v202501alpha1', false, true);
      return Array.isArray(data?.filters) ? data.filters : (Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.status === 403) {
        return [];
      }
      throw e;
    }
  }

  async invokeTopXDataQuery(query: any): Promise<any> {
    const kentikV5Query = {
      queries: [{ query: query, bucketIndex: 0 }],
    };

    return this._post('/api/v5/query/topXdata', kentikV5Query);
  }

  async invokeDrilldownUrlQuery(query: any): Promise<any> {
    const kentikV5Query = {
      queries: [{ query: query, bucketIndex: 0 }],
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
      lastValueFrom(
        this.backendSrv.fetch<any>({
          method: 'GET',
          url: this.baseUrl + url,
          showErrorAlert: !requiresAdminLevel && !silentOnForbidden,
        })
      ).then(result => result.data
      );

    return retry(
      requestFn,
      (error: FetchError) => {
        if (error.status === 429) {
          showAlert(error);
          return true;
        }
        if (error.status === 403 && (requiresAdminLevel || silentOnForbidden)) {
          return false;
        }
        showAlert(error);
        return false;
      }
    );
  }

  private async _post(url: string, data: any, silentOnForbidden = false): Promise<any> {
    try {
      const resp = await this.backendSrv.post(this.baseUrl + url, data);

      if (resp) {
        return resp;
      } else {
        return [];
      }
    } catch (error: any) {
      if (error.status === 403 && silentOnForbidden) {
        throw error;
      }
      showAlert(error);
      if (error.err) {
        throw error.err;
      } else {
        throw error;
      }
    }
  }

  private async _put(url: string, data: any): Promise<any> {
    try {
      const resp = await this.backendSrv.put(this.baseUrl + url, data);

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
