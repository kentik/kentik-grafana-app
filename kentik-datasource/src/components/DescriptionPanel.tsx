import { KentikAPI } from '../datasource/kentik_api';

import { getBackendSrv, getDataSourceSrv } from '@grafana/runtime';
import { PanelProps, GrafanaTheme2 } from '@grafana/data';
import { Stack, useStyles2 } from '@grafana/ui';
import React, { FC, useEffect, useState } from 'react';

import { css } from '@emotion/css';

interface Props extends PanelProps<{}> { }

export const DescriptionPanel: FC<Props> = (props) => {

    const styles = useStyles2(getStyles);
    const [state, setState] = useState({
        // TODO: Device type
        devices: [] as any[],
    });

    useEffect(() => {
        async function init() {
            const uid = await getKentikUid();
            if (!uid) { return; }
            const kentik = new KentikAPI(getBackendSrv(), uid);
            const devices = await kentik.getDevices();
            setState((s) => ({
                ...s,
                devices,
            }));
        }
        init();
    }, [state.devices.length]);

    async function getKentikUid() {
        const dsList = await getDataSourceSrv().getList();
        const kentikDs = dsList.find((ds) => ds.type === 'kentik-datasource');
        return kentikDs?.uid || '';
    }

    return (
        <div>
            <img className={styles.image} src={`public/plugins/kentik-datasource/img/kentik_logo.png`} />
            <p>
                Kentik for Grafana allows you to quickly and easily add network activity visibility metrics to your
                Grafana dashboard. By leveraging the power of Kentik’s monitoring SaaS, you can enjoy rich, actionable insights
                into consumers of network bandwidth and anomalies that can affect application or service performance.
            </p>
            <div className={styles.actionsContainer}>
                <Stack direction="column">
                    <div>Complete:</div>
                    <Stack direction="row">
                        <i className={styles.successIcon + ' icon-gf icon-gf-check'}></i>
                        <span className={styles.successLine}>Install Kentik for Grafana.</span>
                    </Stack>
                    {state.devices.length > 0 && (
                        <Stack direction="row">
                            <i className={styles.successIcon + ' icon-gf icon-gf-check'}></i>
                            <span className={styles.successLine}>Add your first device.</span>
                        </Stack>
                    )}
                </Stack>
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
});
