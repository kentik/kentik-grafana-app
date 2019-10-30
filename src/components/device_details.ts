import { KentikAPI } from '../datasource/kentik_api';
import { showCustomAlert } from '../datasource/alert_helper';
import { getRegion } from '../datasource/region_helper';

import { BackendSrv } from 'grafana/app/core/services/backend_srv';
import { AlertSrv } from 'grafana/app/core/services/alert_srv';

export class DeviceDetailsCtrl {
  static templateUrl: string;
  device: any;
  deviceDTO: any;
  pageReady: boolean;
  otherIps: any;
  kentik: KentikAPI = {} as KentikAPI;
  region = '';

  /** @ngInject */
  constructor(
    public $scope: ng.IScope,
    public $http: ng.IHttpService,
    public $location: ng.ILocationService,
    public backendSrv: BackendSrv,
    public alertSrv: AlertSrv
  ) {
    this.device = {};
    this.deviceDTO = {};
    this.pageReady = false;
    // get region from datasource
    this.initRegion();
  }

  async initRegion(): Promise<void> {
    const datasources = await this.backendSrv.get('/api/datasources');
    this.region = getRegion(datasources);
    this.kentik = new KentikAPI(this.backendSrv, this.$http);
    this.kentik.setRegion(this.region);
    await this.getDevice(this.$location.search().device);

    this.pageReady = true;
    this.$scope.$apply();
  }


  addIP() {
    this.otherIps.push({ ip: '' });
  }

  removeIP(index: number) {
    this.otherIps.splice(index, 1);
  }

  async getDevice(deviceId: string): Promise<void> {
    const resp = await this.backendSrv.get(
      `/api/plugin-proxy/kentik-app/${this.region}/api/v5/device/${deviceId}`
    );
    this.device = resp.device;
    this.updateDeviceDTO();
  }

  gotoDashboard(deviceName: string) {
    this.$location.url(`/dashboard/db/kentik-top-talkers?var-device=${deviceName}`);
  }

  updateDeviceDTO() {
    this.deviceDTO = {
      device_id: this.device.id,
      device_name: this.device.device_name,
      device_type: this.device.device_type,
      device_description: this.device.device_description,
      device_flow_type: this.device.device_flow_type,
      device_sample_rate: parseInt(this.device.device_sample_rate, 10),
      minimize_snmp: this.device.minimize_snmp,
      device_snmp_ip: this.device.device_snmp_ip,
      device_snmp_community: this.device.device_snmp_community,
      device_bgp_type: this.device.device_bgp_type,
      device_bgp_password: this.device.device_bgp_password,
      device_bgp_neighbor_ip: this.device.device_bgp_neighbor_ip,
      device_bgp_neighbor_asn: parseInt(this.device.device_bgp_neighbor_asn, 10),
    };
  }

  async update(): Promise<void> {
    if (!this.deviceDTO.device_snmp_ip) {
      delete this.deviceDTO.device_snmp_ip;
    }
    if (!this.deviceDTO.device_snmp_community) {
      delete this.deviceDTO.device_snmp_community;
    }
    const data = { device: this.deviceDTO };

    try {
      const resp = await this.backendSrv.put(
        `/api/plugin-proxy/kentik-app/${this.region}/api/v5/device/${this.deviceDTO.device_id}`,
        data
      );
      if ('err' in resp) {
        showCustomAlert('Device Update failed.', resp.err, 'error');
      } else {
        showCustomAlert('Device Updated.', this.deviceDTO.device_name, 'success');
        return this.getDevice(this.deviceDTO.device_id);
      }
    } catch (error) {
      if ('error' in error.data) {
        showCustomAlert('Device Update failed.', error.data.error, 'error');
        return;
      } else {
        showCustomAlert('Device Update failed.', error, 'error');
        return;
      }
    }
  }
}

DeviceDetailsCtrl.templateUrl = 'components/device_details.html';
