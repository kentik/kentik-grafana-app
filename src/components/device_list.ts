import { KentikAPI } from '../datasource/kentikAPI';

import { BackendSrv } from 'grafana/app/core/services/backend_srv';

class DeviceListCtrl {
  static templateUrl: string;
  devices: any[];
  pageReady: boolean;
  kentik: KentikAPI;

  /** @ngInject */
  constructor(
    private $scope: ng.IScope,
    $http: ng.IHttpService,
    public $location: ng.ILocationService,
    public backendSrv: BackendSrv
  ) {
    this.devices = [];
    this.pageReady = false;
    this.kentik = new KentikAPI(this.backendSrv, $http);
    this.getDevices();
  }

  async getDevices() {
    this.devices = await this.kentik.getDevices();
    this.pageReady = true;
    this.$scope.$apply();
  }

  refresh() {
    this.getDevices();
  }

  gotoDashboard(device: any) {
    this.$location.path('/dashboard/db/kentik-top-talkers').search({ 'var-device': device.device_name });
  }

  gotoDeviceDetail(device: any) {
    this.$location.url('/plugins/kentik-app/page/device-details?device=' + device.id);
  }
}

DeviceListCtrl.templateUrl = 'components/device_list.html';

export { DeviceListCtrl };
