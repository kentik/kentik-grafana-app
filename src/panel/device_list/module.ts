import { KentikAPI } from '../../datasource/kentik_api';
import { showAlert } from '../../datasource/alert_helper';
import { getRegion } from '../../datasource/region_helper';

import { PanelCtrl } from 'grafana/app/plugins/sdk';
import { loadPluginCss } from 'grafana/app/plugins/sdk';
import { BackendSrv } from 'grafana/app/core/services/backend_srv';

import * as _ from 'lodash';


loadPluginCss({
  dark: 'plugins/kentik-app/styles/dark.css',
  light: 'plugins/kentik-app/styles/light.css',
});

const panelDefaults = {
  fullscreen: true,
};

class DeviceListCtrl extends PanelCtrl {
  static templateUrl: string;
  devices: any[];
  pageReady: boolean;
  kentik: KentikAPI = {} as KentikAPI;
  region = '';

  /** @ngInject */
  constructor(
    $scope: ng.IScope,
    $injector: ng.auto.IInjectorService,
    public $http: ng.IHttpService,
    public $location: ng.ILocationService,
    public backendSrv: BackendSrv
  ) {
    super($scope, $injector);
    _.defaults(this.panel, panelDefaults);
    this.devices = [];
    this.pageReady = false;
    // get region from datasource
    this.initRegion();
  }

  async initRegion(): Promise<void> {
    const datasources = await this.backendSrv.get('/api/datasources');
    this.region = getRegion(datasources);
    this.kentik = new KentikAPI(this.backendSrv, this.$http);
    this.kentik.setRegion(this.region);
    await this.fetchDevices();
  }


  async fetchDevices() {
    try {
      this.devices = await this.kentik.getDevices();
      this.pageReady = true;
    } catch (e) {
      showAlert(e);
    }
  }

  refresh() {
    this.fetchDevices();
  }

  gotoDashboard(device: any) {
    this.$location.path('/dashboard/db/kentik-top-talkers').search({ 'var-device': device.device_name });
  }

  gotoDeviceDetail(device: any) {
    this.$location.url('/plugins/kentik-app/page/device-details?device=' + device.id);
  }
}

DeviceListCtrl.templateUrl = 'public/plugins/kentik-app/components/device_list.html';

export { DeviceListCtrl as PanelCtrl };
