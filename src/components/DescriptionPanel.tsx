import { KentikAPI } from '../datasource/kentik_api';

import { getBackendSrv, locationService } from '@grafana/runtime';
import { PanelProps, GrafanaTheme2 } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import React, { FC, useEffect, useState } from 'react';

import { css } from '@emotion/css';

interface Props extends PanelProps<{}> {}

export const DescriptionPanel: FC<Props> = () => {
  const styles = useStyles2(getStyles);
  const [state, setState] = useState({
    // TODO: Device type
    devices: [] as any[],
  });
  const backendSrv = getBackendSrv();
  const kentik = new KentikAPI(backendSrv);

  useEffect(() => {
    fetchDevices();
    // eslint-disable-next-line
  }, []);

  async function fetchDevices(): Promise<void> {
    const devices = await kentik.getDevices();
    setState({
      ...state,
      devices,
    });
  }

  const handleTopTalkersClick = () => {
    locationService.push('/d/NS58GIo71/kentik-top-talkers');
  };

  return (
    <div className={styles.container}>
      <img className={styles.image} src="public/plugins/kentik-connect-app/img/kentik_logo.png" />
      <p className={styles.descriptionText}>
        Kentik Connect Pro for Grafana allows you to quickly and easily add network activity visibility metrics to your
        Grafana dashboard. By leveraging the power of Kentik’s monitoring SaaS, you can enjoy rich, actionable insights
        into consumers of network bandwidth and anomalies that can affect application or service performance.
      </p>
      <div className={styles.actionsContainer}>
        <Button variant={'primary'} fill={'text'} onClick={handleTopTalkersClick}>Kentik Top Talkers</Button>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  image: css`
    pointer-events: none;
    user-select: none;
    margin-left: -10px;
    width: 150px;
    margin-bottom: 10px;
  `,
  container: css`
    padding: 16px;
  `,
  actionsContainer: css`
    margin-left: 16px;
  `,
  title: css`
    margin-bottom: 0px;
  `,
  successIcon: css`
    color: #6ccf8e;
    font-size: 24px;
  `,
  successLine: css`
    text-decoration: line-through;
  `,
  descriptionText: css`
    max-width: 600px;
  `,
});
