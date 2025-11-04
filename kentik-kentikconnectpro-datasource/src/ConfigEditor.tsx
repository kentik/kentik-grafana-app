import React, { ChangeEvent, useState, useEffect } from 'react';
import { JsonData, MyDataSourceOptions, MySecureJsonData, Region } from './types';
import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue, DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Input, SecretInput, Button, Field, FieldSet, RadioButtonGroup, useStyles2 } from '@grafana/ui';
import { showCustomAlert } from './utils/alert_helper';
import { KentikAPI } from './datasource/kentik_api';

const REGION_OPTIONS: Array<SelectableValue<Region>> = [
  { label: 'US (default)', value: Region.DEFAULT },
  { label: 'EU', value: Region.EU },
  { label: 'Custom', value: Region.CUSTOM },
];

type State = Required<JsonData> & {
  token: string;
  apiValidated: boolean;
  apiMemberWarning: boolean;
  apiError: boolean;
};

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> { }

export function ConfigEditor(props: Props) {
  const { options, onOptionsChange } = props;

  const s = useStyles2(getStyles);
  const { jsonData, secureJsonFields } = options;

  const [state, setState] = useState<State>({
    url: jsonData?.url || 'https://grpc.api.kentik.com',
    email: jsonData?.email || '',
    region: jsonData?.region || Region.DEFAULT,
    dynamicUrl: jsonData?.dynamicUrl || '',
    tokenSet: Boolean(jsonData?.tokenSet || secureJsonFields?.token),
    token: '',
    apiValidated: false,
    apiMemberWarning: false,
    apiError: false,
  });

  useEffect(() => {
    if (isConfigured()) {
      validateApiConnection();
    }
    // eslint-disable-next-line
  }, []);

  const isConfigured = (): boolean => {
    return (!!state.tokenSet || !!state.token) && !!state.email && !!state.region;
  };

  const _getUrlByRegion = (region?: Region): string => {
    switch (region) {
      case Region.DEFAULT:
        return 'https://grpc.api.kentik.com';
      case Region.EU:
        return 'https://grpc.api.kentik.eu';
      case Region.CUSTOM:
        return state.dynamicUrl;
      default:
        throw new Error(`Unknown region type: "${region}"`);
    }
  };

  const onChangeEmail = (e: ChangeEvent<HTMLInputElement>) => setState({ ...state, email: e.target.value.trim() });
  const onChangeCustomUrl = (e: ChangeEvent<HTMLInputElement>) =>
    setState({ ...state, dynamicUrl: e.target.value.trim(), url: _getUrlByRegion(Region.CUSTOM) });
  const onChangeRegion = (region: Region) => setState({ ...state, region, url: _getUrlByRegion(region), dynamicUrl: '' });
  const onChangeToken = (e: ChangeEvent<HTMLInputElement>) => setState({ ...state, token: e.target.value.trim() });
  const onResetToken = () =>
    setState({ ...state, token: '', tokenSet: false, apiValidated: false, apiMemberWarning: false, apiError: false });

  const _onApiError = () => setState({ ...state, apiValidated: false, apiError: true });

  const validateApiConnection = async (): Promise<boolean> => {
    const backendSrv = getBackendSrv();
    const kentik = new KentikAPI(backendSrv, options.uid);
    try {
      await kentik.getSites();
    } catch {
      _onApiError();
      return false;
    }
    try {
      await kentik.getUsers();
    } catch (e: any) {
      if (e.status !== 403) {
        _onApiError();
        return false;
      }
      setState({ ...state, apiMemberWarning: true });
    }
    setState({ ...state, apiValidated: true });
    showCustomAlert('API working!', '', 'success');
    return true;
  };

  const saveSettings = async () => {
    const optionsFormValues = {
      name: options.name,
      isDefault: options.isDefault,
      jsonData: {
        ...options.jsonData,
        url: state.url,
        email: state.email,
        region: state.region,
        dynamicUrl: state.dynamicUrl,
        tokenSet: !!state.token,
      },
      secureJsonData: state.tokenSet ? undefined : { token: state.token }
    }

    try {
      onOptionsChange({
        ...options,
        ...optionsFormValues
      });
      showCustomAlert('Settings saved!', '', 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Failed to save datasource config:', err);
      showCustomAlert('Error saving settings', '', 'error');
    }
  };

  const isSubmitDisabled = !isConfigured();

  return (
    <div>
      <FieldSet label="Enter your Kentik Credentials" className={s.marginTop}>
        <Field label="Email">
          <Input value={state.email} placeholder="email" onChange={onChangeEmail} width={60} />
        </Field>

        <Field label="Region">
          <RadioButtonGroup value={state.region} options={REGION_OPTIONS} onChange={onChangeRegion} />
        </Field>

        {state.region === Region.CUSTOM && (
          <Field label="Custom URL">
            <Input value={state.dynamicUrl} placeholder="https://grpc.api.kentik.com" onChange={onChangeCustomUrl} width={60} />
          </Field>
        )}

        <Field label="API Token">
          <SecretInput value={state.token} isConfigured={state.tokenSet} onChange={onChangeToken} onReset={onResetToken} width={60} />
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
            disabled={isSubmitDisabled}
            onClick={saveSettings}
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