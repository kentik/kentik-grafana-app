import configTemplate from './config.html';

import { KentikAPI } from '../datasource/kentik_api';
import { showAlert, showCustomAlert } from '../datasource/alert_helper';

import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';

class KentikConfigCtrl {
  apiValidated = false;
  apiError = false;
  appEditCtrl: any;
  appModel: any;
  kentik: KentikAPI;
  static template: any;
  regionTypes = [{ value: 'default', text: 'US (default)' }, { value: 'eu', text: 'EU' }, { value: 'custom', text: 'Custom' }];

  /** @ngInject */
  constructor(public $scope: ng.IScope, $http: ng.IHttpService, public backendSrv: BackendSrv) {
    this.appEditCtrl.setPreUpdateHook(this.preUpdate.bind(this));
    this.appEditCtrl.setPostUpdateHook(this.postUpdate.bind(this));

    if (!this.appModel.jsonData) {
      this.appModel.jsonData = {};
    }
    if (!this.appModel.secureJsonData) {
      this.appModel.secureJsonData = {};
    }
    if (typeof this.appModel.jsonData.region === 'undefined') {
      this.appModel.jsonData.region = 'default';
    }
    this.kentik = new KentikAPI(this.backendSrv, $http);
    this.kentik.setRegion(this.appModel.jsonData.region);
    if (this.appModel.enabled && this.appModel.jsonData.tokenSet) {
      this.validateApiConnection();
    }
  }

  preUpdate() {
    if (this.appModel.secureJsonData.token) {
      this.appModel.jsonData.tokenSet = true;
    }

    return this.initDatasource();
  }

  async postUpdate() {
    if (!this.appModel.enabled) {
      return Promise.resolve();
    }

    await this.validateApiConnection();

    return {
      url: 'dashboard/db/kentik-home',
      message: 'Kentik Connect Pro app installed!',
    };
  }

  // make sure that we can hit the Kentik API.
  async validateApiConnection() {
    try {
      const result = await this.kentik.getUsers();
      try {
        if (result.hasOwnProperty('data')) {
          this.apiValidated = true;
          showCustomAlert('API working!', '', 'success');
        }
      } catch (e) {
        showAlert('Unexpected result from API: ' + e);
        this.apiValidated = false;
        this.apiError = true;
      }
    } catch (e) {
      this.apiValidated = false;
      this.apiError = true;
    }
    this.$scope.$digest();
  }

  reset() {
    this.appModel.jsonData.email = '';
    this.appModel.jsonData.tokenSet = false;
    this.appModel.jsonData.region = 'default';
    this.appModel.jsonData.dynamicUrl = '';
    this.appModel.secureJsonData = {};
    this.apiValidated = false;
  }

  async initDatasource(): Promise<any[]> {
    //check for existing datasource.
    const results = await this.backendSrv.get('/api/datasources');
    let foundKentikDS = false;
    let updateKentikDS = false;
    let dsID = NaN;
    _.forEach(results, ds => {
      // use the type
      if (ds.type === 'kentik-ds') {
        foundKentikDS = true;
        dsID = ds.id;
        updateKentikDS = true;

        if (ds.jsonData.region !== this.appModel.jsonData.region) {
          updateKentikDS = true;
        }
        if (ds.jsonData !== this.appModel.jsonData) {
          updateKentikDS = true;
        }
        return;
      }
    });
    const promisesResults: any[] = [];
    if (!foundKentikDS || updateKentikDS) {
      // create datasource
      const kentik = {
        name: 'kentik',
        type: 'kentik-ds',
        access: 'proxy',
        jsonData: this.appModel.jsonData,
      };
      if (updateKentikDS) {
        // update requires a PUT with the id
        promisesResults.push(await this.backendSrv.put(`/api/datasources/${dsID}`, kentik));
      } else {
        promisesResults.push(await this.backendSrv.post('/api/datasources', kentik));
      }
    }
    return promisesResults;
  }
}

KentikConfigCtrl.template = configTemplate;

export { KentikConfigCtrl as ConfigCtrl };
