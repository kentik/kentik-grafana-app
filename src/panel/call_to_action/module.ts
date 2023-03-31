import { KentikAPI } from '../../datasource/kentik_api';
import { showAlert } from '../../datasource/alert_helper';

import { PanelCtrl, loadPluginCss } from 'grafana/app/plugins/sdk';
import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';

loadPluginCss({
  dark: 'plugins/kentik-connect-app/styles/dark.css',
  light: 'plugins/kentik-connect-app/styles/light.css',
});

const panelDefaults = {
  fullscreen: true,
};

class CallToActiontCtrl extends PanelCtrl {
  static templateUrl: string;
  deviceStatus: string;
  allDone: boolean;
  kentik: KentikAPI = {} as KentikAPI;

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

    this.kentik = new KentikAPI(this.backendSrv, this.$http);
    this.fetchTaskStatus();
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

CallToActiontCtrl.templateUrl = 'public/plugins/kentik-connect-app/panel/call_to_action/module.html';
export { CallToActiontCtrl as PanelCtrl };
