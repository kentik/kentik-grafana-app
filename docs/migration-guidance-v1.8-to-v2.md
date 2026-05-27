# Kentik Migration Guidance: Bridge (v1.8.0) to Datasource (v2.x)

## Audience

This guidance is for users migrating from the legacy Kentik app plugin to the standalone Kentik datasource plugin.

## Current Recommendation

- New installs should install Kentik datasource v2.0.1 directly.
- Existing app users may pass through the v1.8.0 bridge, then move immediately to datasource v2.x.
- The bridge is migration-oriented and should not be treated as a long-term destination.

For new installs, reference the Grafana catalog page:

- https://grafana.com/grafana/plugins/kentik-connect-datasource/

## Why users can see "Dashboard not found" in v1.8.0

In v1.8.0, the app package is designed to transition users to the datasource plugin. App routes and app-managed dashboards may not remain a stable primary UX surface in all environments.

Expected path is:

1. Open Connections > Data sources
2. Add or select Kentik datasource
3. Configure Kentik credentials there
4. Use datasource-backed dashboards and panels

## User-facing migration text (copy/paste)

If you are on Kentik app v1.8.0:

1. Go to Connections > Data sources
2. Add/select Kentik datasource
3. Enter your Kentik email and API token
4. Update dashboards/panels to use the Kentik datasource if needed
5. Upgrade to v2.0.1

If app links show "dashboard not found", continue migration through the datasource page; this is expected in bridge-oriented installs.

## Notes from local validation

- Clean baseline was created with v1.7.0 plugin state and no pre-existing Kentik dashboards in Grafana DB.
- Upgraded in place to v1.8.0 and then to v2.0.1.
- Grafana remained running throughout validation.
- Any legacy app-centric behavior at 1.8.0 was treated as bridge-only and not the target end state.

## End-state target

- Plugin: kentik-connect-datasource v2.0.1
- Configuration surface: datasource config page
- Dashboards: bundled datasource dashboards (Home, Top Talkers, Site Overview, Network Health)
