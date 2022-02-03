import { KentikAPI } from '../datasource/kentik_api';
import { showCustomAlert } from '../datasource/alert_helper';

import { getBackendSrv } from '@grafana/runtime';
import { AppRootProps } from '@grafana/data';

import React, { FC, FormEvent, useEffect, useState  } from 'react';

import * as _ from 'lodash';


export const deviceDetails: FC<AppRootProps> = ({ query, path, meta }) => {
  const [state, setState] = useState({
    pageReady: false,
    // TODO: Device type
    device: {} as any,
    deviceDTO: {} as any,
    tabIndex: 1
  });

  const backendSrv = getBackendSrv();
  const kentik = new KentikAPI(backendSrv);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fetchDevice(params.get('device') as string);
  }, []);

  async function fetchDevice(deviceId: string): Promise<void> {
    const device = await kentik.getDeviceById(deviceId);
    const deviceDTO = {
      device_id: device.id,
      device_name: device.device_name,
      device_type: device.device_type,
      device_description: device.device_description,
      device_flow_type: device.device_flow_type,
      device_sample_rate: parseInt(device.device_sample_rate, 10),
      minimize_snmp: device.minimize_snmp ? 1 : 0,
      device_snmp_ip: device.device_snmp_ip,
      device_snmp_community: device.device_snmp_community,
      device_bgp_type: device.device_bgp_type,
      device_bgp_password: device.device_bgp_password,
      device_bgp_neighbor_ip: device.device_bgp_neighbor_ip,
      device_bgp_neighbor_asn: parseInt(device.device_bgp_neighbor_asn, 10),
    };

    setState({
      ...state,
      pageReady: true,
      device,
      deviceDTO
    });
  }

  function onTabClick(tabIndex: number) {
    setState({
      ...state,
      tabIndex
    });
  }

  function onFieldChange(
    event: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>,
    field: string
  ): void {
    const deviceForUpdate = state.deviceDTO;
    // @ts-ignore
    deviceForUpdate[field] = event.target.value;
    setState({
      ...state,
      deviceDTO: deviceForUpdate
    });
  }

  async function update(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const updatedDevice = _.cloneDeep(state.deviceDTO);
    if (!updatedDevice.device_snmp_ip) {
      delete updatedDevice.device_snmp_ip;
    }
    if (!updatedDevice.device_snmp_community) {
      delete updatedDevice.device_snmp_community;
    }
    updatedDevice.minimize_snmp = Boolean(updatedDevice.minimize_snmp);
    const data = { device: updatedDevice };

    try {
      const resp = await kentik.updateDevice(state.deviceDTO.device_id, data);
      if ('err' in resp) {
        showCustomAlert('Device Update failed.', resp.err, 'error');
      } else {
        showCustomAlert('Device Updated.', state.deviceDTO.device_name, 'success');
        return fetchDevice(state.deviceDTO.device_id);
      }
    } catch (error: any) {
      if ('error' in error.data) {
        showCustomAlert('Device Update failed.', error.data.error, 'error');
        return;
      } else {
        showCustomAlert('Device Update failed.', error, 'error');
        return;
      }
    }
  }

  function goToDashboard(device: any): void {
    window.location = `/d/NS58GIo71/kentik-top-talkers?var-device=${device.device_name}` as any;
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          { state.device.device_name }
          <a onClick={() => goToDashboard(state.device)}>
            <i
              className="icon icon-gf icon-gf-dashboard"
              bs-tooltip="'Go to Kentik: Summary </br>dashboard for this Device'"
            ></i>
          </a>
        </h1>
        <div className="page-header-tabs">
          <ul className="gf-tabs">
            <li className="gf-tabs-item">
              <a className={`gf-tabs-link ${state.tabIndex === 1 && 'active'}`} onClick={() => onTabClick(1)}>
                Configuration
              </a>
            </li>
            <li className="gf-tabs-item">
              <a className={`gf-tabs-link ${state.tabIndex === 2 && 'active'}`} onClick={() => onTabClick(2)}>
                Help
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="page-body">
        { state.tabIndex === 1 && (
          <div className="tab-content page-content-with-sidebar">
            <form name="collectorNameForm" onSubmit={update}>
              <div>
                <br/>
                <div className="gf-form-group">
                  <h3 className="page-headering">Update device details</h3>
                </div>
                <div className="gf-form-group">
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Device Name</label>
                    <input
                      className="gf-form-input max-width-21"
                      type="text"
                      value={state.deviceDTO.device_name}
                      onChange={event => onFieldChange(event, 'device_name')}
                      required
                    />
                  </div>
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Device Type</label>
                    <div className="gf-form-select-wrapper">
                      <select
                        className="gf-form-input gf-size-auto"
                        value={state.deviceDTO.device_type}
                        onChange={event => onFieldChange(event, 'device_type')}
                      >
                        <option value="router">Router</option>
                        <option value="host-nprobe-basic">Host</option>
                        <option value={state.device.device_type}>Other ({state.device.device_type})</option>
                      </select>
                    </div>
                  </div>
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Device ID</label>
                    <label className="gf-form-label max-width-21">{ state.deviceDTO.device_id }</label>
                  </div>
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Client ID</label>
                    <label className="gf-form-label max-width-21">{ state.device.company_id }</label>
                  </div>
                </div>

                <div className="gf-form-group">
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Description</label>
                    <input
                      className="gf-form-input max-width-21"
                      type="text"
                      value={state.deviceDTO.device_description}
                      onChange={event => onFieldChange(event, 'device_description')}
                    />
                  </div>
                  { state.deviceDTO.device_type === 'router' && (
                    <div className="gf-form">
                      <label className="gf-form-label width-11">Flow Type</label>
                      <div className="gf-form-select-wrapper">
                        <select
                          className="gf-form-input gf-size-auto"
                          value={state.deviceDTO.device_flow_type}
                          onChange={event => onFieldChange(event, 'device_flow_type')}
                        >
                          <option value="sflow">sFlow</option>
                          <option value="netflow.v5">NetFlow v5</option>
                          <option value="netflow.v9">NetFlow v9</option>
                          <option value="ipfix">IPFIX</option>
                        </select>
                      </div>
                    </div>
                  )}
                  { state.deviceDTO.device_type === 'host-nprobe-basic' && (
                    <div className="gf-form">
                      <label className="gf-form-label width-11">Flow Type</label>
                      <div className="gf-form-select-wrapper">
                        <select
                          className="gf-form-input gf-size-auto"
                          value={state.deviceDTO.device_flow_type}
                          onChange={event => onFieldChange(event, 'device_flow_type')}
                        >
                          <option value="ipfix">IPFIX</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="gf-form">
                    <label className="gf-form-label width-11">Sample Rate</label>
                    <input
                      className="gf-form-input max-width-5"
                      type="number"
                      value={state.deviceDTO.device_sample_rate}
                      onChange={event => onFieldChange(event, 'device_sample_rate')}
                      required
                    />
                  </div>
                </div>
                { state.deviceDTO.device_type === 'router' && (
                  <div className="gf-form-group">
                    <div className="gf-form">
                      <label className="gf-form-label width-11">SNMP Polling</label>
                      <div className="gf-form-select-wrapper">
                        <select
                          className="gf-form-input gf-size-auto"
                          value={state.deviceDTO.minimize_snmp}
                          onChange={event => onFieldChange(event, 'minimize_snmp')}
                        >
                          <option value="1">Minimum</option>
                          <option value="0">Standard</option>
                        </select>
                      </div>
                    </div>
                    <div className="gf-form">
                      <label className="gf-form-label width-11">SNMP Community</label>
                      <input
                        className="gf-form-input max-width-15"
                        type="text"
                        value={state.deviceDTO.device_snmp_community}
                        onChange={event => onFieldChange(event, 'device_snmp_community')}
                      />
                    </div>
                    <div className="gf-form">
                      <label className="gf-form-label width-11">Device IP</label>
                      <input
                        className="gf-form-input max-width-15"
                        type="text"
                        value={state.deviceDTO.device_snmp_ip}
                        onChange={event => onFieldChange(event, 'device_snmp_ip')}
                      />
                    </div>
                  </div>
                )}
                <div className="gf-form-group">
                  <div className="gf-form">
                    <label className="gf-form-label width-11">BGP</label>
                    <div className="gf-form-select-wrapper">
                      <select className="gf-form-input max-width-15" disabled>
                        <option>Available with paid acounts</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <button type="submit" className="btn btn-success">Update Device</button>
              <a className="btn btn-link" href="/a/kentik-connect-app?tab=device-list">Cancel</a>
            </form>
          </div>
          )
        }

        { state.tabIndex === 2 && (
          <div className="tab-content page-content-with-sidebar">
            <div className="plugin-markdown-readme">
              <br />
              <h2>Router Configuration Overview</h2>
              <p>Setting up a device to use with Kentik Detect involves configuration steps on the device itself and also on
                the Devices » Add Device page in the Kentik Detect portal. Before you start, you'll need to know whether you'll
                be exporting flow to the Kentik Detect servers directly or through a local encryptor/redirector running the
                Kentik software called "chfagent" (see NetFlow Proxy Agent).</p>

              <p>The device configuration process varies depending on device manufacturer, but is typically performed in
                "configuration mode" or in a "configuration editor." Before you start you'll need to know the following
                information:
                <ul>
                  <li>The destination IP and Port for the router to send flow too (flow collector IP). Depending on your
                    configuration, this will be either the Kentik Detect servers (see the device tab for "flow collector IP"
                    and "flow collector port") or will be the IP and Port you chose on your local encryptor/redirector running
                    chfagent.</li>
                  <li>The sample rate (see Flow Sampling).</li>
                  <li>Whether you will examine ingress or egress (ingress is recommended; see Ingress and Egress).</li>
                </ul>
              </p>
              <p>The following sections cover several configurations that work on some hardware/software combinations.</p>

              <em>Notes: </em>
              <p>- Routers must be configured to persist SNMP interface IDs across reboots. The example configurations below
                include, where applicable, the commands to accomplish this.</p>
              <p>- Every vendor changes flow configuration slightly based on hardware and software versions. The configuration
                information below is provided for reference only. Check your router vendor documentation before configuring
                your devices for use with Kentik Detect.</p>

              <h2>SNMP OID Polling</h2>
              <p>OIDs are identifiers for SNMP objects that each represent the properties of a network-connected device such as
                a router. An OID takes the form of a path to the SNMP object it represents. Like a standard HTTP path, each
                segment represents a successively narrower slice of the entire networked universe, but in the case of an OID
                each segment is a pre-assigned number. The base OID for MIB-2 defined SNMP variables is 1.3.6.1.2.1.</p>

              <p>Kentik Detect polls 11 SNMP OIDs in two different categories:
                <ul>
                  <li><strong>Selected counter OIDs</strong>: polled every two minutes; stored for SNMP-related querying, e.g.
                    comparison to flow (see Compare Flow with SNMP).</li>
                  <li><strong>Selected info OIDs</strong>: polled every 30 minutes for interface information.</li>
                </ul>
              </p>
              <p>To enable Kentik Detect to properly poll SNMP on a given router:
                <ul>
                  <li>Ensure that SNMP is enabled for the router.</li>
                  <li>Permit SNMP polling of the router from the IPs listed in the Device SNMP Polling IPs field of the Device
                    Details page in the portal.</li>
                  <li>Set community on the router to match the SNMP Community string indicated on the Device Details page for
                    the router.</li>
                  <li>If the router has been configured to block polling of any of the specific OIDs polled by Kentik Detect,
                    re-enable polling of those OIDs.</li>
                </ul>
              </p>
              <p>If you've successfully completed the steps above, after about 30 minutes (one complete polling interval)
                you'll be able to verify in the portal that Kentik Detect is able to poll your router:
                <ul>
                  <li>Go to the portal's Devices page (choose Devices from the drop-down Admin menu).</li>
                  <li>In the Device list, confirm that the SNMP indicator in the column at left is green.</li>
                  <li>Click the Interfaces button for the router, which takes you to that router's Interfaces page.</li>
                  <li>Verify that names and descriptions for the router's interfaces appear on the Interfaces page.</li>
                  <li>Verify that blue bars for SNMP ingress and egress are present in the left-hand columns of the Interfaces
                    list.</li>
                  <li>Click the Traffic button to go to the Data Explorer, where you'll see a graph comparing SNMP and flow
                    rates for the router over the preceding hour.</li>
                </ul>
              </p>
            </div>
          </div>
        )
      }
      </div>
    </div>
  );
};
