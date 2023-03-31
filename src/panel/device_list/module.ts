/* eslint-disable */
import { KentikAPI } from '../../datasource/kentik_api';
import { showAlert } from '../../datasource/alert_helper';

import { PanelCtrl } from 'grafana/app/plugins/sdk';
import { loadPluginCss } from 'grafana/app/plugins/sdk';
import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';

loadPluginCss({
  dark: 'plugins/kentik-connect-app/styles/dark.css',
  light: 'plugins/kentik-connect-app/styles/light.css',
});

const panelDefaults = {
  fullscreen: true,
};

class DeviceListCtrl extends PanelCtrl {
  static templateUrl: string;
  devices: any[];
  pageReady: boolean;
  showDeviceDesc: boolean;
  kentik: KentikAPI = {} as KentikAPI;

  /** @ngInject */
  constructor(
    public $scope: ng.IScope,
    $injector: ng.auto.IInjectorService,
    public $http: ng.IHttpService,
    public $location: ng.ILocationService,
    public backendSrv: BackendSrv
  ) {
    super($scope, $injector);
    _.defaults(this.panel, panelDefaults);

    this.devices = [];
    this.pageReady = false;
    this.showDeviceDesc = false;

    this.kentik = new KentikAPI(this.backendSrv, this.$http);
    this.fetchDevices();
  }

  async fetchDevices() {
    try {
      this.devices = await this.kentik.getDevices();

      this.pageReady = true;
      this.$scope.$apply();
    } catch (e) {
      showAlert(e);
    }
  }

  refresh() {
    this.fetchDevices();
  }

  gotoDashboard(device: any) {
    this.$location.path('/d/NS58GIo71/kentik-top-talkers').search({ 'var-device': device.device_name });
  }
}

DeviceListCtrl.templateUrl = 'public/plugins/kentik-connect-app/panel/device_list/module.html';

export { DeviceListCtrl as PanelCtrl };
