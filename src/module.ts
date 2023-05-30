import { AppConfig } from './components/AppConfig';

import './styles/dark.scss';
import './styles/light.scss';

import { AppPlugin } from '@grafana/data';
import { loadPluginCss } from 'grafana/app/plugins/sdk';

loadPluginCss({
  dark: 'plugins/kentik-connect-app/styles/dark.css',
  light: 'plugins/kentik-connect-app/styles/light.css',
});

export const plugin = new AppPlugin<{}>().addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
