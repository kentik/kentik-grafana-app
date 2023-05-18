import { AppPlugin } from '@grafana/data';
import { RootPage } from './RootPage';

import './styles/dark.scss';
import './styles/light.scss';

import { ConfigCtrl } from './config/config';
import { loadPluginCss } from 'grafana/app/plugins/sdk';

loadPluginCss({
  dark: 'plugins/kentik-connect-app/styles/dark.css',
  light: 'plugins/kentik-connect-app/styles/light.css',
});

export { ConfigCtrl };

export const plugin = new AppPlugin<{}>().setRootPage(RootPage);
