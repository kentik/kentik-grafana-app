import { showAlert } from '../datasource/alert_helper';

import { FetchError } from '@grafana/runtime';

import * as _ from 'lodash';
import angular from 'angular';


export class KentikAPI {
  baseUrl: string;
  /** @ngInject */
  constructor(public backendSrv: any, public $http?: ng.IHttpService) {
    this.baseUrl = '/api/plugin-proxy/kentik-connect-app';
  }

  async getDeviceById(deviceId: string): Promise<any> {
    const resp = await this._get(`/api/v5/device/${deviceId}?noCustomColumns=True`);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async updateDevice(deviceId: string, data: any): Promise<any> {
    const resp = await this._put(`/api/v5/device/${deviceId}`, data);
    if (resp && resp.device) {
      return resp.device;
    } else {
      return [];
    }
  }

  async getDevices(): Promise<any> {
    const resp = await this._get('/api/v5/devices?noCustomColumns=True');
    if (resp && resp.devices) {
      return resp.devices;
    } else {
      return [];
    }
  }

  async getSites(): Promise<any> {
    const resp = await this._get('/api/v5/sites');
    if (resp && resp.sites) {
      return resp.sites;
    } else {
      return [];
    }
  }

  async getUsers(): Promise<any> {
    const requiresAdminLevel = true;
    return this._get('/api/v5/users', requiresAdminLevel);
  }

  async getFieldValues(field: string): Promise<any> {
    const query = `SELECT DISTINCT ${field} FROM all_devices ORDER BY ${field} ASC`;
    return this.invokeSQLQuery(query);
  }

  async getCustomDimensions(): Promise<any[]> {
    try {
      const requiresAdminLevel = true;
      const resp = await this._get('/api/v5/customdimensions', requiresAdminLevel);
      return resp.customDimensions;
    } catch (e: any) {
      if (e.status === 403) {
        return [];
      }
      throw e;
    }
  }

  async getSavedFilters(): Promise<any> {
    const data = await this._get('/api/v5/saved-filters');
    return data;
  }

  async invokeTopXDataQuery(query: any): Promise<any> {
    const kentikV5Query = {
      queries: [{ query: query, bucketIndex: 0 }],
    };

    return this._post('/api/v5/query/topXdata', kentikV5Query);
  }

  async invokeSQLQuery(query: any): Promise<any> {
    const data = {
      query: query,
    };

    return this._post('/api/v5/query/sql', data);
  }

  private async _get(url: string, requiresAdminLevel = false): Promise<any> {
    return retry(
      this.backendSrv.request.bind(this.backendSrv, { method: 'GET', url: this.baseUrl + url, showErrorAlert: !requiresAdminLevel }),
      (error: FetchError) => {
        // HTTP Error 429: Too Many Requests
        if (error.status === 429) {
          showAlert(error);
          return true;
        }
        // HTTP Error 403: Forbidden
        if (error.status !== 403 || requiresAdminLevel === false) {
          showAlert(error);
        }
        return false;
      });
  }

  private async _post(url: string, data: any): Promise<any> {
    try {
      const resp = await this.backendSrv.post(
        this.baseUrl + url,
        data,
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

  private async _put(url: string, data: any): Promise<any> {
    try {
      const resp = await this.backendSrv.put(
        this.baseUrl + url,
        data,
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

const retry = (
  fn: Function,
  shouldContinue: (error: FetchError) => boolean,
  retriesLeft = 100,
  interval = 1000
) => new Promise((resolve, reject) => {
  console.log(`Retries left: ${retriesLeft} - Next retry interval: ${interval}`);
  fn()
    .then(resolve)
    .catch((error: FetchError) => {
      if (!shouldContinue(error)) {
        reject(error);
        return;
      }
      if (retriesLeft === 0) {
        // Maximum retries exceeded
        reject(error);
        return;
      }
      setTimeout(() => {
        // Passing on "reject" is the important part
        retry(fn, shouldContinue, retriesLeft - 1, interval + 1000).then(resolve, reject);
      }, interval);
    });
});

angular.module('grafana.services').service('kentikAPISrv', KentikAPI);
