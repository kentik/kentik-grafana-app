import { AppPlugin } from '@grafana/data';

/**
 * kentik-connect-app v1.8.0 — Bridge plugin
 *
 * This is a minimal app shell that exists only to auto-install the
 * kentik-connect-datasource plugin for existing kentik-connect-app users.
 * All functionality now lives in kentik-connect-datasource.
 */
export const plugin = new AppPlugin<{}>();
