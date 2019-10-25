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
    $http: ng.IHttpService,
    public $location: ng.ILocationService,
    public backendSrv: BackendSrv,
    public alertSrv: AlertSrv
  ) {
    this.device = {};
    this.deviceDTO = {};
    this.pageReady = false;
    // get region from datasource
    backendSrv.get('/api/datasources').then((allDS: any) => {
      this.region = getRegion(allDS);
      this.kentik = new KentikAPI(this.backendSrv, $http);
      this.kentik.setRegion(this.region);
      this.getDevice($location.search().device);
    });
  }

  addIP() {
    this.otherIps.push({ ip: '' });
  }

  removeIP(index: number) {
    this.otherIps.splice(index, 1);
  }

  getDevice(deviceId: string) {
    this.backendSrv.get(`/api/plugin-proxy/kentik-app/${this.region}/api/v5/device/` + deviceId).then((resp: any) => {
      this.device = resp.device;
      this.updateDeviceDTO();
      this.pageReady = true;
    });
  }

  gotoDashboard(deviceName: string) {
    this.$location.url('/dashboard/db/kentik-top-talkers?var-device=' + deviceName);
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

  update() {
    if (!this.deviceDTO.device_snmp_ip) {
      delete this.deviceDTO.device_snmp_ip;
    }
    if (!this.deviceDTO.device_snmp_community) {
      delete this.deviceDTO.device_snmp_community;
    }
    const data = { device: this.deviceDTO };

    this.backendSrv.put(`/api/plugin-proxy/kentik-app/${this.region}/api/v5/device/` + this.deviceDTO.device_id, data).then(
      (resp: any) => {
        if ('err' in resp) {
          showCustomAlert('Device Update failed.', resp.err, 'error');
        } else {
          showCustomAlert('Device Updated.', this.deviceDTO.device_name, 'success');
          return this.getDevice(this.deviceDTO.device_id);
        }
      },
      (error: any) => {
        if ('error' in error.data) {
          showCustomAlert('Device Update failed.', error.data.error, 'error');
          return;
        } else {
          showCustomAlert('Device Update failed.', error, 'error');
          return;
        }
      }
    );
  }
}

DeviceDetailsCtrl.templateUrl = 'components/device_details.html';
