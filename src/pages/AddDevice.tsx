/* eslint-disable */
import { appEvents } from 'grafana/app/core/core';

import { AppRootProps, AppEvents } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

import React, { FC, FormEvent, useState } from 'react';
import _ from 'lodash';

const defaults = {
  device_name: '',
  device_type: 'router',
  device_description: '',
  device_flow_type: 'sflow',
  device_sample_rate: 5,
  sending_ips: '',
  minimize_snmp: 0,
  device_bgp_type: 'none',
  device_snmp_ip: '',
  device_snmp_community: '',
};

export const addDevice: FC<AppRootProps> = () => {
  const backendSrv = getBackendSrv();

  const [state, setState] = useState({
    device: _.cloneDeep(defaults),
    sendingIps: [{ ip: '' }],
  });

  function addIP(): void {
    setState({
      ...state,
      sendingIps: _.concat(state.sendingIps, { ip: '' }),
    });
  }

  function removeIP(index: number): void {
    setState({
      ...state,
      sendingIps: _.filter(state.sendingIps, (el, idx) => idx !== index),
    });
  }

  function handleIpChange(event: React.ChangeEvent<HTMLInputElement>, index: number): void {
    const ipsForUpdate = state.sendingIps;
    ipsForUpdate[index] = { ip: event.target.value };
    setState({
      ...state,
      sendingIps: ipsForUpdate,
    });
  }

  function onDeviceFieldChange(
    event: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>,
    field: string
  ): void {
    console.log('state', state.device, field);
    const deviceForUpdate = state.device;
    // @ts-ignore
    deviceForUpdate[field] = event.target.value;
    setState({
      ...state,
      device: deviceForUpdate,
    });
  }

  async function appendDevice(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const ips: string[] = [];
    _.forEach(state.sendingIps, (ip) => {
      ips.push(ip.ip);
    });
    const payload = {
      ...state.device,
      minimize_snmp: Boolean(state.device.minimize_snmp),
      sending_ips: ips.join(),
    };
    const resp = await backendSrv.post(`/api/plugin-proxy/kentik-connect-app/api/v5/device`, payload);
    if ('err' in resp) {
      appEvents.emit(AppEvents.alertError, ['Device Add failed', resp.err]);
      throw new Error(`Device Add failed: ${resp.err}`);
    } else {
      window.location = '/a/kentik-connect-app?tab=device-list' as any;
    }
  }

  function cancel(): void {
    window.location = '/d/xScUGST71/kentik-home' as any;
  }

  let typeSelector;
  switch (state.device.device_type) {
    case 'router':
      typeSelector = (
        <div className="gf-form">
          <label className="gf-form-label width-11">Flow Type</label>
          <div className="gf-form-select-wrapper">
            <select
              className="gf-form-input gf-size-auto"
              value={state.device.device_flow_type}
              onChange={(event) => onDeviceFieldChange(event, 'device_flow_type')}
            >
              <option value="sflow">sFlow</option>
              <option value="netflow.v5">NetFlow v5</option>
              <option value="netflow.v9">NetFlow v9</option>
              <option value="ipfix">IPFIX</option>
            </select>
          </div>
        </div>
      );
      break;
    case 'host-nprobe-basic':
      typeSelector = (
        <div className="gf-form">
          <label className="gf-form-label width-11">Flow Type</label>
          <div className="gf-form-select-wrapper">
            <select
              className="gf-form-input gf-size-auto"
              value={state.device.device_flow_type}
              onChange={(event) => onDeviceFieldChange(event, 'device_flow_type')}
            >
              <option value="hiresflow">HiresFlow</option>
            </select>
          </div>
        </div>
      );
      break;
    default:
      typeSelector = <div></div>;
  }

  return (
    <form name="addDeviceForm" onSubmit={appendDevice}>
      <div className="page-header">
        <h1>Add a New Device</h1>
      </div>
      <div className="row">
        <div className="col-md-10">
          <p>
            Devices in Kentik are sources of network flow data - commonly a network component such as a switch or
            router, or a flow generation agent on a host/server. Once configured, Kentik will automatically begin
            tracking and returning direct insights from that source viewpoint into exactly which applications and
            endpoints are actively driving network traffic.
          </p>
        </div>
      </div>
      <div className="gf-form-group">
        <div className="gf-form">
          <label className="gf-form-label width-11">Device Name</label>
          <input
            className="gf-form-input max-width-21"
            type="text"
            pattern="^[A-Za-z0-9_]{1,15}$"
            required
            value={state.device.device_name}
            onChange={(event) => onDeviceFieldChange(event, 'device_name')}
          />
        </div>
        <div className="gf-form">
          <label className="gf-form-label width-11">Device Type</label>
          <div className="gf-form-select-wrapper">
            <select
              className="gf-form-input gf-size-auto"
              value={state.device.device_type}
              onChange={(event) => onDeviceFieldChange(event, 'device_type')}
            >
              <option value="router">Router</option>
              <option value="host-nprobe-basic">Host</option>
            </select>
          </div>
        </div>
      </div>

      <div className="gf-form-group">
        <div className="gf-form">
          <label className="gf-form-label width-11">Description</label>
          <input
            className="gf-form-input max-width-21"
            type="text"
            value={state.device.device_description}
            onChange={(event) => onDeviceFieldChange(event, 'device_description')}
          />
        </div>
        {typeSelector}
        <div className="gf-form">
          <label className="gf-form-label width-11">Sample Rate</label>
          <input
            className="gf-form-input max-width-5"
            type="number"
            required
            value={state.device.device_sample_rate}
            onChange={(event) => onDeviceFieldChange(event, 'device_sample_rate')}
          />
        </div>
        {state.sendingIps.map((ip, index) => {
          return (
            <div className="gf-form">
              <label className="gf-form-label width-11">Source Address</label>
              <input
                className="gf-form-input max-width-15"
                type="text"
                value={ip.ip}
                onChange={(event) => handleIpChange(event, index)}
                required
              />
              {index === 0 ? (
                <a className="btn btn-inverse btn-small" onClick={addIP}>
                  <i className="fa fa-plus"></i>
                </a>
              ) : (
                <a className="btn btn-inverse btn-small" onClick={() => removeIP(index)}>
                  <i className="fa fa-minus"></i>
                </a>
              )}
            </div>
          );
        })}
      </div>
      {state.device.device_type === 'router' && (
        <div className="gf-form-group">
          <div className="gf-form">
            <label className="gf-form-label width-11">SNMP Polling</label>
            <div className="gf-form-select-wrapper">
              <select
                className="gf-form-input gf-size-auto"
                value={state.device.minimize_snmp}
                onChange={(event) => onDeviceFieldChange(event, 'minimize_snmp')}
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
              value={state.device.device_snmp_community}
              onChange={(event) => onDeviceFieldChange(event, 'device_snmp_community')}
            />
          </div>
          <div className="gf-form">
            <label className="gf-form-label width-11">Device IP</label>
            <input
              className="gf-form-input max-width-15"
              type="text"
              value={state.device.device_snmp_ip}
              onChange={(event) => onDeviceFieldChange(event, 'device_snmp_ip')}
            />
          </div>
        </div>
      )}
      <div className="gf-form-group">
        <div className="gf-form">
          <label className="gf-form-label width-11">BGP</label>
          <div className="gf-form-select-wrapper">
            <select className="gf-form-input max-width-15" disabled>
              <option>Available with paid accounts</option>
            </select>
          </div>
        </div>
      </div>
      <button className="btn btn-success">Add Device</button>
      <a className="btn btn-link" onClick={cancel}>
        Cancel
      </a>
    </form>
  );
};
