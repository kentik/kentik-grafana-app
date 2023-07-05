import { SecretInput } from './utils/SecretInput';
import { showCustomAlert } from '../utils/alert_helper';
import { KentikAPI } from '../datasource/kentik_api';

import { Button, Field, Input, useStyles2, FieldSet, RadioButtonGroup } from '@grafana/ui';
import { PluginConfigPageProps, AppPluginMeta, PluginMeta, GrafanaTheme2, SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

import { css } from '@emotion/css';

import React, { useState, ChangeEvent, useEffect } from 'react';

import * as _ from 'lodash';

enum Region {
  DEFAULT = 'default',
  EU = 'eu',
  CUSTOM = 'custom',
}

const REGION_OPTIONS: Array<SelectableValue<Region>> = [
  {
    label: 'US (default)',
    value: Region.DEFAULT,
  },
  {
    label: 'EU',
    value: Region.EU,
  },
  {
    label: 'Custom',
    value: Region.CUSTOM,
  },
];

export type JsonData = {
  url?: string;
  email?: string;
  region?: Region;
  dynamicUrl?: string;
  tokenSet?: boolean;
};

type State = Required<JsonData> & {
  apiValidated: boolean;
  apiMemberWarning: boolean;
  apiError: boolean;
  // secretJsonData:
  token: string;
};

interface Props extends PluginConfigPageProps<AppPluginMeta<JsonData>> {}

export const AppConfig = ({ plugin }: Props) => {
  const s = useStyles2(getStyles);
  const { jsonData, enabled } = plugin.meta;

  const [state, setState] = useState<State>({
    url: jsonData?.url || 'https://grafana-api.kentik.com/api/v5',
    email: jsonData?.email || '',
    region: jsonData?.region || Region.DEFAULT,
    dynamicUrl: jsonData?.dynamicUrl || '',
    tokenSet: Boolean(jsonData?.tokenSet),
    token: '',
    apiValidated: false,
    apiMemberWarning: false,
    apiError: false,
  });

  useEffect(() => {
    if (enabled && isConfigured()) {
      validateApiConnection();
    }
    // eslint-disable-next-line
  }, []);

  const onResetToken = () =>
    setState({
      ...state,
      token: '',
      tokenSet: false,
      apiValidated: false,
      apiMemberWarning: false,
      apiError: false,
    });

  const onChangeToken = (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      token: event.target.value.trim(),
    });
  };

  const onChangeEmail = (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      email: event.target.value.trim(),
    });
  };

  const onChangeCustomUrl = (event: ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      dynamicUrl: event.target.value.trim(),
      url: _getUrlByRegion(Region.CUSTOM),
    });
  };

  const onChangeRegion = (region: Region) => {
    setState({
      ...state,
      region,
      url: _getUrlByRegion(region),
      dynamicUrl: '',
    });
  };

  const _onApiError = (): void => {
    setState({
      ...state,
      apiValidated: false,
      apiError: true,
    });
  };

  const _getUrlByRegion = (region?: Region): string => {
    switch (region) {
      case Region.DEFAULT:
        return 'https://grafana-api.kentik.com/api/v5';
      case Region.EU:
        return 'https://api.kentik.eu/api/v5';
      case Region.CUSTOM:
        return state.dynamicUrl;
      default:
        throw new Error(`Unknown region type: "${region}"`);
    }
  };

  // make sure that we can hit the Kentik API.
  const validateApiConnection = async (): Promise<boolean> => {
    const backendSrv = getBackendSrv();
    const kentik = new KentikAPI(backendSrv);
    // any user (Admin / Member) can get devices
    try {
      await kentik.getSites();
    } catch (e) {
      _onApiError();
      return false;
    }

    // only Admin can get users list
    try {
      await kentik.getUsers();
    } catch (e: any) {
      if (e.status !== 403) {
        _onApiError();
        return false;
      }

      setState({
        ...state,
        apiMemberWarning: true,
      });
    }

    setState({
      ...state,
      apiValidated: true,
    });
    showCustomAlert('API working!', '', 'success');
    return true;
  };

  const isConfigured = (): boolean => {
    return (state.tokenSet || !_.isEmpty(state.token)) && !_.isEmpty(state.region) && !_.isEmpty(state.email);
  };

  const updatePluginAndReload = async (pluginId: string, data: Partial<PluginMeta<JsonData>>) => {
    try {
      await updatePlugin(pluginId, { ...data, enabled: true, pinned: true });
      await initDatasource(data);
      // Reloading the page as the changes made here wouldn't be propagated to the actual plugin otherwise.
      // This is not ideal, however unfortunately currently there is no supported way for updating the plugin state.
      window.location.reload();
    } catch (e) {
      console.error('Error while updating the plugin', e);
    }
  };

  const initDatasource = async (data: Partial<PluginMeta<JsonData>>): Promise<any[]> => {
    const backendSrv = getBackendSrv();
    //check for existing datasource.
    const results = await backendSrv.get('/api/datasources');
    let foundKentikDS = false;
    let updateKentikDS = false;
    let dsID = NaN;
    _.forEach(results, (ds) => {
      // use the type
      if (ds.type === 'kentik-connect-datasource' || ds.type === 'kentik-ds') {
        foundKentikDS = true;
        dsID = ds.id;
        updateKentikDS = true;

        if (ds.type === 'kentik-ds' || ds.jsonData.region !== data.jsonData?.region || ds.jsonData !== data.jsonData) {
          updateKentikDS = true;
        }
        return;
      }
    });
    const promisesResults: any[] = [];
    if (!foundKentikDS || updateKentikDS) {
      // create datasource
      const datasourceSettings = {
        name: 'kentik',
        type: 'kentik-connect-datasource',
        access: 'proxy',
        jsonData: data.jsonData,
      };
      if (updateKentikDS) {
        // update requires a PUT with the id
        promisesResults.push(await backendSrv.put(`/api/datasources/${dsID}`, datasourceSettings));
      } else {
        promisesResults.push(await backendSrv.post('/api/datasources', datasourceSettings));
      }
    }
    return promisesResults;
  };

  return (
    <div>
      {/* CUSTOM SETTINGS */}
      <FieldSet label="Enter your Kentik Credentials" className={s.marginTop}>
        {/* Email */}
        <Field label="Email" description="">
          <Input
            width={60}
            id="email"
            label={`Email`}
            value={state.email}
            placeholder={`email`}
            onChange={onChangeEmail}
          />
        </Field>

        {/* Region */}
        <Field label="Region" description="">
          <RadioButtonGroup value={state.region} options={REGION_OPTIONS} onChange={onChangeRegion} />
        </Field>

        {/* Custom URL */}
        {state.region === Region.CUSTOM && (
          <Field label="Custom URL" description="">
            <Input
              width={60}
              id="custom-url"
              label={`Custom URL`}
              value={state.dynamicUrl}
              placeholder={`https://grafana-api.kentik.com/api/v5`}
              onChange={onChangeCustomUrl}
            />
          </Field>
        )}

        {/* API Token */}
        <Field label="API Token">
          <SecretInput
            width={60}
            id="api-token"
            value={state.token}
            isConfigured={state.tokenSet}
            placeholder={'Your secret API token'}
            onChange={onChangeToken}
            onReset={onResetToken}
          />
        </Field>

        {isConfigured() && state.apiError && (
          <div className="gf-form">
            <i className={`fa fa-exclamation-circle ${s.colorError}`}>
              <span className={s.marginLeft}>
                Invalid API credentials. This app won`t work until the credentials are updated.
              </span>
            </i>
          </div>
        )}

        {state.tokenSet && state.apiValidated && (
          <div className="kentik-enabled-box">
            <i className="icon-gf icon-gf-check kentik-api-status-icon success"></i>
            <span className={s.marginLeft}>
              Successfully enabled.
              <strong> Next up: </strong>
              <a href="d/xScUGST71/kentik-home" className="external-link">
                Go to Kentik Home Dashboard
              </a>
            </span>
          </div>
        )}

        {state.tokenSet && state.apiValidated && state.apiMemberWarning && (
          <div className="kentik-enabled-box">
            <i className="fa fa-warning kentik-api-status-icon warning"></i>
            <span className={s.marginLeft}>
              The specified Kentik user seems to have Member access level (not Admin), Custom Dimensions in the
              dashboard filters won`t be available.
            </span>
          </div>
        )}

        <div className={s.marginTop}>
          <Button
            type="submit"
            onClick={() =>
              updatePluginAndReload(plugin.meta.id, {
                jsonData: {
                  tokenSet: true,
                  url: state.url,
                  email: state.email,
                  region: state.region,
                  dynamicUrl: state.dynamicUrl,
                },
                // This cannot be queried later by the frontend.
                // We don't want to override it in case it was set previously and left untouched now.
                secureJsonData: state.tokenSet
                  ? undefined
                  : {
                      token: state.token,
                    },
              })
            }
            disabled={!isConfigured()}
          >
            Save API settings
          </Button>
        </div>
      </FieldSet>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  colorError: css`
    color: ${theme.colors.error.text};
  `,
  marginTop: css`
    margin-top: ${theme.spacing(1)};
  `,
  marginLeft: css`
    margin-left: ${theme.spacing(1)};
  `,
});

const updatePlugin = async (pluginId: string, data: Partial<PluginMeta>): Promise<void> => {
  await getBackendSrv().post(
    `/api/plugins/${pluginId}/settings`,
    data,
    // @ts-ignore
    { showSuccessAlert: false }
  );
};
