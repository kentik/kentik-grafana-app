import { showAlert } from '../datasource/alert_helper';

import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';
import angular from 'angular';


export class KentikAPI {
  baseUrl: string;
  /** @ngInject */
  constructor(public backendSrv: BackendSrv, public $http: ng.IHttpService) {
    this.baseUrl = '/api/plugin-proxy/kentik-app';
  }

  async getDevices(): Promise<any> {
    const resp = await this._get('/api/v5/devices');

    if (resp.data && resp.data.devices) {
      return resp.data.devices;
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
      return resp.data.customDimensions;
    } catch (e) {
      if (e.status === 403) {
        return [];
      }
      throw e;
    }
  }

  async getSavedFilters(): Promise<any> {
    const data = await this._get('/api/v5/saved-filters');
    return data.data;
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
    try {
      const resp = await this.$http({
        method: 'GET',
        url: this.baseUrl + url,
      });

      return resp;
    } catch (error) {
      if (error.status !== 403 || requiresAdminLevel === false) {
        showAlert(error);
      }
      if (error.err) {
        throw error.err;
      } else {
        throw error;
      }
    }
  }

  private async _post(url: string, data: any): Promise<any> {
    try {
      const resp = await this.$http({
        method: 'POST',
        url: this.baseUrl + url,
        data: data,
      });

      if (resp.data) {
        return resp.data;
      } else {
        return [];
      }
    } catch (error) {
      showAlert(error);
      if (error.err) {
        throw error.err;
      } else {
        throw error;
      }
    }
  }
}

angular.module('grafana.services').service('kentikAPISrv', KentikAPI);
