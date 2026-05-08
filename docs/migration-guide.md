# Migration Guide — kentik-connect-app → kentik-connect-datasource

## Overview

Starting with **v1.8.0**, the legacy `kentik-connect-app` plugin is a
**bridge release** that automatically installs the new
**`kentik-connect-datasource`** plugin. The `kentik-connect-datasource`
(v2.0.0) is a standalone datasource plugin that replaces all
functionality previously provided by the app plugin.

Grafana requires datasource plugins to use a `-datasource` ID suffix,
so the new plugin is published under a new ID. Both plugins can coexist
on the same Grafana instance without conflict.

## Step-by-step migration

### 1. Install v1.8.0 of kentik-connect-app

When you update `kentik-connect-app` to v1.8.0, Grafana will
automatically install `kentik-connect-datasource` as a dependency.

### 2. Add a Kentik datasource

1. Navigate to **Connections → Data Sources** in Grafana.
2. Click **Add data source** and search for **Kentik**.
3. Select the appropriate **Region** (US, EU, or Custom).
4. Enter your Kentik **Email** and **API Token**.
5. Click **Save & Test** to verify connectivity.

### 3. Update your dashboards

Edit each dashboard that uses the old Kentik datasource and switch the
panel queries to the new **Kentik** datasource (`kentik-connect-datasource`).

The query editor in the new plugin is fully compatible with the
dimensions, metrics, and filters used by the legacy plugin. In most
cases you only need to change the datasource selector.

### 4. Remove the legacy app plugin (optional)

Once all dashboards are migrated, you can safely disable or uninstall
`kentik-connect-app`. The new datasource plugin operates independently.

## Programmatic dashboard migration

If you have many dashboards, you can rewrite datasource references through
the Grafana API.

Dry run (no writes):

```bash
npm run migrate:dashboards -- \
	--old-type kentik-connect-app \
	--old-uid kentik-connect-app \
	--old-name "Kentik Connect Pro" \
	--new-type kentik-connect-datasource \
	--new-uid kentik
```

Apply changes:

```bash
npm run migrate:dashboards -- \
	--old-type kentik-connect-app \
	--old-uid kentik-connect-app \
	--old-name "Kentik Connect Pro" \
	--new-type kentik-connect-datasource \
	--new-uid kentik \
	--no-dry-run
```

The script writes dashboard backups to `migration-test/backups/` before updates.

## Local end-to-end migration test

This repository includes a local validation script for a v1.7-style dashboard
fixture:

```bash
docker compose up -d --build
npm run test:migration:local
```

The test imports `migration-test/dashboards/legacy-v17-test.json`, runs the
migration script, and verifies that legacy datasource references were rewritten
to `kentik-connect-datasource` (`uid: kentik`).

## Release validation example

Example apply-mode summary from a local mixed-dashboard test:

```text
Discovered dashboards: 8
UPDATED  custom-mixed-migration-test (Custom Mixed Migration Test) refs=2
UNCHANGED non-kentik-control-test (Non Kentik Control Test)
Summary: updated=1, dryRun=0, unchanged=7, skipped=0, refsRewritten=2
```

Interpretation:

- Only dashboards/panels with legacy Kentik references are rewritten.
- Dashboards that do not reference legacy Kentik datasource IDs remain unchanged.

## What's new in kentik-connect-datasource v2.0.0

- Batch query scheduler (3–5× faster dashboards)
- Portal deep-link from every panel
- 290+ dimensions (Kubernetes, OTT, Kappa, OCI, and more)
- Multi-region support (US, EU, Custom)
- Four bundled dashboards
- Smart series labeling with Alias By autocomplete
- NMS / SNMP device and interface metrics

## Need help?

- [Kentik Documentation](https://kb.kentik.com/)
- [Kentik Connect Datasource on Grafana](https://grafana.com/grafana/plugins/kentik-connect-datasource/)
