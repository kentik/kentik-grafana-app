/* eslint-disable */
import { KentikAPI } from '../datasource/kentik_api';

import { getBackendSrv } from '@grafana/runtime';
import { AppRootProps } from '@grafana/data';
import React, { FC, useEffect, useState } from 'react';

export const deviceList: FC<AppRootProps> = ({ query, path, meta }) => {
  const [state, setState] = useState({
    showDeviceDesc: false,
    pageReady: false,
    // TODO: Device type
    devices: [] as any[],
  });

  const backendSrv = getBackendSrv();
  const kentik = new KentikAPI(backendSrv);

  useEffect(() => {
    fetchDevices();
  }, []);

  async function fetchDevices(): Promise<void> {
    const devices = await kentik.getDevices();
    setState({
      ...state,
      pageReady: true,
      devices,
    });
  }

  function onDeviceDescClick(): void {
    setState({
      ...state,
      showDeviceDesc: !state.showDeviceDesc,
    });
  }

  function goToDashboard(device: any): void {
    window.location = `/d/NS58GIo71/kentik-top-talkers?var-device=${device.device_name}` as any;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="rt-h1">Kentik Connect: Devices</h1>
      </div>

      {!state.pageReady && (
        <div className="kentik-loading-message-container">
          <div className="kentik-loading-message-inside">
            {/* inline styles */}
            <img className="kentik-loading-pulse" src="public/plugins/kentik-connect-app/img/loading-pulse.svg"></img>
            <p className="kentik-loading-msg-1">To infinity...and beyond.</p>
            <p className="kentik-loading-msg-2">This is taking longer than expected.</p>
            <p className="kentik-loading-msg-3">
              We apologize, something may be up. Please try refreshing first, and contact us if this continues to
              happen.
            </p>
          </div>
        </div>
      )}

      {state.pageReady && (
        <div>
          {state.devices.length === 0 && (
            <div className="kentik-empty-device-list">
              {/* inline styles */}
              <div>
                <i className="icon icon-gf icon-gf-endpoint-tiny no-endpoints"></i>
                <p>
                  Looks like you don’t have any devices yet.
                  <br />
                  {/* <a className="highlight-word" href="/a/kentik-connect-app?tab=add-device">Add a new device</a> */}
                </p>
              </div>
              <a onClick={onDeviceDescClick}>
                <span>What's a device?</span>
                {!state.showDeviceDesc && (
                  <span>
                    <i className="fa fa-caret-right rt-box-accordian-control"></i>
                  </span>
                )}
                {state.showDeviceDesc && (
                  <span>
                    <i className="fa fa-caret-down"></i>
                  </span>
                )}
              </a>
              {state.showDeviceDesc && (
                <div className={`kentik-connect-app-devicedesc-box`}>
                  <div className="kentik-collapse-blurb-box">
                    <p className="kentik-helper-blurb">
                      Devices in Kentik are sources of network flow data - commonly a network component such as a switch
                      or router, or a flow generation agent on a host/server.{' '}
                    </p>
                    <p className="kentik-helper-blurb">
                      Once configured, Kentik will automatically begin tracking and returning direct insights from that
                      source viewpoint into exactly which applications and endpoints are actively driving network
                      traffic.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {state.devices.length > 0 && (
        <section className="card-section card-list-layout-list" layout-mode>
          <ol className="card-list">
            {state.devices.map((device) => (
              <li className="card-item-wrapper card-item-wrapper--clickable">
                <div className="card-item pointer" onClick={() => goToDashboard(device)}>
                  <div className="card-item-header card-item-header--kentik-icons card-item-header-action">
                    <a
                      onClick={(event) => event.stopPropagation()}
                      href={`/d/NS58GIo71/kentik-top-talkers?var-device=${device.device_name}`}
                    >
                      <i
                        className="icon icon-gf icon-gf-dashboard"
                        bs-tooltip="'Go to Top Talkers</br>dashboard for {{device.device_name}}'"
                      ></i>
                    </a>
                    <a
                      onClick={(event) => event.stopPropagation()}
                      href={`/a/kentik-connect-app?tab=device-details&device=${device.id}`}
                    >
                      <i className="icon icon-gf icon-gf-settings" bs-tooltip="'Configure {{device.device_name}}'"></i>
                    </a>
                  </div>
                  <div className="card-item-body">
                    <div className="card-item-details">
                      <a
                        onClick={(event) => event.stopPropagation()}
                        href={`/d/NS58GIo71/kentik-top-talkers?var-device=${device.device_name}`}
                      >
                        <div className="card-item-name">{device.device_name}</div>
                        <div className="card-item-sub-name">
                          <span className="card-item-sub-name--header">{device.device_type}: </span>{' '}
                          {device.device_description}
                        </div>
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};
