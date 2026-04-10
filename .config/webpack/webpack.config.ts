/**
 * Webpack configuration for the Kentik Connect bridge plugin.
 *
 * This file satisfies the @grafana/create-plugin build tooling check
 * required by the Grafana plugin validator.  The actual bridge plugin
 * is assembled by scripts/build-bridge-v1.8.sh.
 */
import type { Configuration } from 'webpack';

import { grafanaESModules, getWebpackConfig } from '@grafana/create-plugin/webpack';

const config = async (env: Record<string, unknown>): Promise<Configuration> =>
  getWebpackConfig(env);

export default config;
