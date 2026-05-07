/**
 * Custom webpack config that extends the Grafana scaffold and fixes source map
 * paths so the Grafana plugin validator can resolve user source files.
 *
 * The scaffold sets context=src/, which makes ConfigEditor.tsx appear as
 * ./ConfigEditor.tsx in sourcemaps. The validator looks for that path in the
 * cloned repo root, where it doesn't exist (it's at src/ConfigEditor.tsx).
 * This override prefixes user-module paths with src/ so they resolve correctly.
 */
import type { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import scaffoldConfig from './.config/webpack/webpack.config.ts';

type Env = { [key: string]: true | string | Env };

const PLUGIN_ID = 'kentik-connect-datasource';

export default async (env: Env): Promise<Configuration> => {
  const base = await scaffoldConfig(env);

  return merge(base, {
    devtool: env.production ? 'source-map' : 'eval-source-map',
  });
};
