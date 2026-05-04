# Kentik Connect Pro — Migration Bridge

This plugin has been replaced by the
**Kentik Connect Datasource** (`kentik-connect-datasource`).

This v1.8.0 release is a bridge that automatically installs
the new datasource plugin for existing `kentik-connect-app`
users. It contains no functionality of its own.

## Migration

See the [Migration Guide](https://github.com/kentik/kentik-grafana-app/blob/bridge/kentik-connect-app-v1.8.0/docs/migration-guide.md) for upgrade instructions.

## What's new in kentik-connect-datasource v2.0.0

- Batch query scheduler (3–5× faster dashboards)
- Portal deep-link from every panel
- 290+ dimensions (Kubernetes, OTT, Kappa, OCI, and more)
- Multi-region support (US, EU, Custom)
- Four bundled dashboards
- Smart series labeling with Alias By autocomplete

Install the new plugin:
[Kentik Connect Datasource on Grafana](https://grafana.com/grafana/plugins/kentik-connect-datasource/)
