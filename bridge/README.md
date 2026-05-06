# Kentik Connect Pro — Migration Bridge

This plugin has been replaced by the
**Kentik Connect Datasource** (`kentik-connect-datasource`).

This v1.8.0 release is a bridge that automatically installs
the new datasource plugin for existing `kentik-connect-app`
users. It contains no functionality of its own.

## Migration

Quick steps:

1. Install/upgrade this bridge plugin (`kentik-connect-app` v1.8.0).
2. Open Grafana once so it can auto-install `kentik-connect-datasource` v2.0.0.
3. Move dashboards and datasource configuration to `kentik-connect-datasource`.

For full details, see the [Migration Guide](https://github.com/kentik/kentik-grafana-app/blob/bridge/kentik-connect-app-v1.8.0-clean/docs/migration-guide.md).

## What's new in kentik-connect-datasource v2.0.0

- Batch query scheduler (3–5× faster dashboards)
- Portal deep-link from every panel
- 290+ dimensions (Kubernetes, OTT, Kappa, OCI, and more)
- Multi-region support (US, EU, Custom)
- Four bundled dashboards
- Smart series labeling with Alias By autocomplete

Install the new plugin:
[Kentik Connect Datasource on Grafana](https://grafana.com/grafana/plugins/kentik-connect-datasource/)
