import { KentikAPI } from '../../datasource/kentik_api';
import { showAlert } from '../../datasource/alert_helper';
import { PanelCtrl, loadPluginCss } from 'grafana/app/plugins/sdk';
import { getRegion } from '../../datasource/region_helper';

import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';

loadPluginCss({
  dark: 'plugins/kentik-app/styles/dark.css',
  light: 'plugins/kentik-app/styles/light.css',
});

const panelDefaults = {
  fullscreen: true,
};

class CallToActiontCtrl extends PanelCtrl {
  static templateUrl: string;
  deviceStatus: string;
  allDone: boolean;
  kentik: KentikAPI = {} as KentikAPI;
  region = '';

  /** @ngInject */
  constructor(
    $scope: ng.IScope,
    $injector: ng.auto.IInjectorService,
    public $http: ng.IHttpService,
    public backendSrv: BackendSrv
  ) {
    super($scope, $injector);
    _.defaults(this.panel, panelDefaults);
    this.deviceStatus = '';
    this.allDone = false;
    // get region from datasource
    this.initRegion();
  }

  async initRegion(): Promise<void> {
    const datasources = await this.backendSrv.get('/api/datasources');
    this.region = getRegion(datasources);
    this.kentik = new KentikAPI(this.backendSrv, this.$http);
    this.kentik.setRegion(this.region);
    await this.fetchTaskStatus();
  }

  async fetchTaskStatus() {
    await this.fetchDevices();

    if (this.deviceStatus === 'hasDevices') {
      this.allDone = true;
    } else {
      this.allDone = false;
    }
  }

  async fetchDevices() {
    try {
      const devices = await this.kentik.getDevices();

      if (devices.length > 0) {
        this.deviceStatus = 'hasDevices';
      } else {
        this.deviceStatus = 'noDevices';
      }
    } catch (e) {
      showAlert(e);
    }
  }

  refresh() {
    this.fetchTaskStatus();
  }
}

CallToActiontCtrl.templateUrl = 'panel/call_to_action/module.html';
export { CallToActiontCtrl as PanelCtrl };
