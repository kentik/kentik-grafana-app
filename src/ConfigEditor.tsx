import React, { ChangeEvent, useState, useEffect } from 'react';
import { JsonData, MyDataSourceOptions, MySecureJsonData, Region, Url } from './types';
import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue, DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Input, SecretInput, Button, Field, FieldSet, RadioButtonGroup, Stack, useStyles2, Icon } from '@grafana/ui';
import { showCustomAlert } from './utils/alert_helper';
import { KentikAPI } from './datasource/kentik_api';

const REGION_OPTIONS: Array<SelectableValue<Region>> = [
  { label: 'US (default)', value: Region.DEFAULT },
  { label: 'EU', value: Region.EU },
  { label: 'Custom', value: Region.CUSTOM },
];

const DEFAULT_URL: Url = { v6: 'https://grpc.api.kentik.com', v5: 'https://api.kentik.com' };
const EU_URL: Url = { v6: 'https://grpc.api.kentik.eu', v5: 'https://api.kentik.eu' };

/** Derive the Kentik API URLs from the selected region. Pure function so it can
 *  be used both during state initialisation and inside event handlers. */
function getUrlByRegion(region: Region | undefined, dynamicUrl?: string): Url {
  switch (region) {
    case Region.EU:
      return EU_URL;
    case Region.CUSTOM:
      return { v6: dynamicUrl || '', v5: dynamicUrl || '' };
    case Region.DEFAULT:
    default:
      return DEFAULT_URL;
  }
}

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

  const KENTIK_PROXY_TIMEOUT_SECONDS = 1800;

  const [state, setState] = useState<State>({
    url: jsonData?.url || getUrlByRegion(jsonData?.region, jsonData?.dynamicUrl),
    email: jsonData?.email || '',
    region: jsonData?.region || Region.DEFAULT,
    dynamicUrl: jsonData?.dynamicUrl || '',
    tokenSet: Boolean(jsonData?.tokenSet || secureJsonFields?.token),
    timeout: jsonData?.timeout ?? KENTIK_PROXY_TIMEOUT_SECONDS,
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

  const _getUrlByRegion = (region?: Region): Url => {
    return getUrlByRegion(region, state.dynamicUrl);
  };

  const onChangeEmail = (e: ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value.trim();
    setState({ ...state, email });
    onOptionsChange({ ...options, jsonData: { ...options.jsonData, email } });
  };
  const onChangeCustomUrl = (e: ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value.trim();
    const url = getUrlByRegion(Region.CUSTOM, newUrl);
    setState({ ...state, dynamicUrl: newUrl, url });
    onOptionsChange({ ...options, jsonData: { ...options.jsonData, dynamicUrl: newUrl, url } });
  };
  const onChangeRegion = (region: Region) => {
    const url = _getUrlByRegion(region);
    setState({ ...state, region, url, dynamicUrl: '' });
    onOptionsChange({ ...options, jsonData: { ...options.jsonData, region, url, dynamicUrl: '' } });
  };
  const onChangeToken = (e: ChangeEvent<HTMLInputElement>) => {
    const token = e.target.value.trim();
    setState({ ...state, token });
    onOptionsChange({ ...options, secureJsonData: { token } });
  };
  const onResetToken = () => {
    setState({ ...state, token: '', tokenSet: false, apiValidated: false, apiMemberWarning: false, apiError: false });
    onOptionsChange({ ...options, secureJsonFields: { ...options.secureJsonFields, token: false }, secureJsonData: {} });
  };

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

  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    if (saving) {
      return;
    }
    setSaving(true);

    const updatedJsonData = {
      ...options.jsonData,
      url: state.url,
      email: state.email,
      region: state.region,
      dynamicUrl: state.dynamicUrl,
      tokenSet: !!state.token || state.tokenSet,
      timeout: state.timeout,
    };

    // Build a minimal payload – only the fields the PUT endpoint needs.
    // Setting version to 0 tells Grafana to skip the optimistic-lock check,
    // which avoids 409 conflicts caused by provisioning version drift.
    const payload: Record<string, any> = {
      name: options.name,
      type: options.type,
      access: options.access,
      uid: options.uid,
      jsonData: updatedJsonData,
      version: 0,
      ...(state.token ? { secureJsonData: { token: state.token } } : {}),
    };

    try {
      await getBackendSrv().put(`/api/datasources/${options.id}`, payload);

      // Keep the parent form state in sync
      onOptionsChange({ ...options, jsonData: updatedJsonData });

      showCustomAlert('Settings saved!', '', 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      const msg = err?.data?.message || 'Unknown error';
      showCustomAlert(`Error saving settings: ${msg}`, '', 'error');
    } finally {
      setSaving(false);
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
          <Stack direction="row" alignItems="center" gap={1}>
            <Icon name="exclamation-circle" className={s.colorError} />
            <span className={s.marginLeft}>
              Invalid API credentials. This app won&apos;t work until the credentials are updated.
            </span>
          </Stack>
        )}

        {state.tokenSet && state.apiValidated && (
          <div className={s.statusBox}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Icon name="check-circle" className={s.colorSuccess} />
              <span className={s.marginLeft}>
                Successfully enabled.
                <strong> Next up: </strong>
                <a href="/d/kentik-home" className="external-link">
                  Go to Kentik Home Dashboard
                </a>
              </span>
            </Stack>
          </div>
        )}

        {state.tokenSet && state.apiValidated && state.apiMemberWarning && (
          <div className={s.statusBox}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Icon name="exclamation-triangle" className={s.colorWarning} />
              <span className={s.marginLeft}>
                The specified Kentik user seems to have Member access level (not Admin), Custom Dimensions in the
                dashboard filters won&apos;t be available.
              </span>
            </Stack>
          </div>
        )}

        <div className={s.marginTop}>
          <Button
            type="submit"
            disabled={isSubmitDisabled || saving}
            onClick={saveSettings}
          >
            {saving ? 'Saving…' : 'Save API settings'}
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
  colorSuccess: css`
    color: ${theme.colors.success.text};
  `,
  colorWarning: css`
    color: ${theme.colors.warning.text};
  `,
  statusBox: css`
    margin-top: ${theme.spacing(1)};
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.secondary};
    border-radius: ${theme.shape.radius.default};
  `,
  marginTop: css`
    margin-top: ${theme.spacing(1)};
  `,
  marginLeft: css`
    margin-left: ${theme.spacing(1)};
  `,
});
