import React, { ChangeEvent } from 'react';
import { MyDataSourceOptions, MySecureJsonData, Region, Url } from './types';
import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue, DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { Input, SecretInput, Field, FieldSet, RadioButtonGroup, Stack, useStyles2, Icon } from '@grafana/ui';

const REGION_OPTIONS: Array<SelectableValue<Region>> = [
  { label: 'US (default)', value: Region.DEFAULT },
  { label: 'EU', value: Region.EU },
  { label: 'Custom', value: Region.CUSTOM },
];

const DEFAULT_URL: Url = { v6: 'https://grpc.api.kentik.com', v5: 'https://api.kentik.com' };
const EU_URL: Url = { v6: 'https://grpc.api.kentik.eu', v5: 'https://api.kentik.eu' };

const KENTIK_PROXY_TIMEOUT_SECONDS = 1800;

/** Derive the Kentik API URLs from the selected region. Pure function so it can
 *  be used both during state initialisation and inside event handlers. */
function getUrlByRegion(region: Region | undefined, dynamicUrl?: string): Url {
  switch (region) {
    case Region.EU:
      return EU_URL;
    case Region.CUSTOM: {
      // Strip trailing slashes to prevent double-slash in proxy route URLs
      const v6 = (dynamicUrl || '').replace(/\/+$/, '');
      // v5 API uses api.* not grpc.api.* — strip the grpc. prefix if present
      const v5 = v6.replace('grpc.api.', 'api.');
      return { v6, v5 };
    }
    case Region.DEFAULT:
    default:
      return DEFAULT_URL;
  }
}

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> { }

/**
 * ConfigEditor follows the standard Grafana datasource pattern: it is a
 * controlled form that reports changes via `onOptionsChange`. Persistence,
 * secret lifecycle management, and validation are handled natively by
 * Grafana's "Save & test" button (which invokes DataSource.testDatasource()).
 *
 * This avoids the previous homegrown `jsonData.tokenSet` flag and manual PUT,
 * which could drift out of sync with the real `secureJsonFields.token` and
 * silently drop the token on save.
 */
export function ConfigEditor(props: Props) {
  const { options, onOptionsChange } = props;
  const s = useStyles2(getStyles);
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as MySecureJsonData;

  const region = jsonData?.region || Region.DEFAULT;
  const dynamicUrl = jsonData?.dynamicUrl || '';
  const isTokenConfigured = Boolean(secureJsonFields?.token);

  const onChangeEmail = (e: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, email: e.target.value.trim() },
    });
  };

  const onChangeRegion = (newRegion: Region) => {
    const url = getUrlByRegion(newRegion, '');
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        region: newRegion,
        url,
        dynamicUrl: '',
        timeout: jsonData?.timeout ?? KENTIK_PROXY_TIMEOUT_SECONDS,
      },
    });
  };

  const onChangeCustomUrl = (e: ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value.trim();
    const url = getUrlByRegion(Region.CUSTOM, newUrl);
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, dynamicUrl: newUrl, url },
    });
  };

  const onChangeToken = (e: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: { ...secureJsonData, token: e.target.value.trim() },
    });
  };

  const onResetToken = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: { ...secureJsonFields, token: false },
      secureJsonData: { ...secureJsonData, token: '' },
    });
  };

  return (
    <div>
      <FieldSet label="Enter your Kentik Credentials" className={s.marginTop}>
        <Field label="Email">
          <Input value={jsonData?.email || ''} placeholder="email" onChange={onChangeEmail} width={60} />
        </Field>

        <Field label="Region">
          <RadioButtonGroup value={region} options={REGION_OPTIONS} onChange={onChangeRegion} />
        </Field>

        {region === Region.CUSTOM && (
          <Field label="Custom URL">
            <Input value={dynamicUrl} placeholder="https://grpc.api.kentik.com" onChange={onChangeCustomUrl} width={60} />
          </Field>
        )}

        <Field label="API Token">
          <SecretInput
            value={secureJsonData.token || ''}
            isConfigured={isTokenConfigured}
            onChange={onChangeToken}
            onReset={onResetToken}
            width={60}
          />
        </Field>

        <div className={s.statusBox}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Icon name="info-circle" />
            <span className={s.marginLeft}>
              Enter your credentials, then click <strong>Save &amp; test</strong> below to validate the connection
              and load the measurement catalog.
            </span>
          </Stack>
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
