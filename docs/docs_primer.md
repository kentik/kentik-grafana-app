# Kentik for Grafana v2.0 - Field & Documentation Primer

*May 2026*

> **Audience:** Sales engineers, support, documentation, and marketing.
> This primer is the source of truth for talking points, upgrade behavior, and known caveats for the v2.0 family of the Kentik Grafana plugin (v2.0.0, v2.0.1, and the upcoming v2.0.2).

---

## TL;DR

- **What it is:** Ground-up rebuild of the Kentik Grafana plugin, published as a standalone datasource (`kentik-connect-datasource`) instead of an app plugin.
- **Why it matters:** Faster dashboards via batch queries, far more dimensions, expanded cloud and Kubernetes coverage, region-aware portal drilldown, and a real series-labeling system.
- **Migration:** Existing app users update `kentik-connect-app` to v1.8.0 (the bridge release), which auto-installs `kentik-connect-datasource`. New users install the datasource directly.
- **Currently shipping:** v2.0.1 in the Grafana catalog. v2.0.2 is in flight to address a Grafana 13+ datasource API compatibility issue (see Talking points below).

> ⚠️ **Scope:** v2.0 covers the same surface area as Kentik **Data Explorer** (flow, SNMP/ST, cloud, DNS/HTTP, OTT, etc.). It does **not** yet include **NMS metrics**. Customers asking specifically for NMS-backed dashboards should be set with that expectation; NMS coverage is a separate roadmap item.

> ⚠️ **Grafana 13+:** v2.0.0 and v2.0.1 cannot save credentials on Grafana 13.0+. v2.0.2 fixes this. Customers on Grafana 13+ should update to v2.0.2.

---

## What's new

### Dashboard performance via batched queries

v2.0 introduces a batch query scheduler that combines all panels on a dashboard into a single API request to Kentik's TopXData endpoint instead of one request per panel. If the batch fails for any reason, the plugin falls back to individual queries, so dashboards keep rendering.

> **How to talk about it:** "Fewer round-trips, faster dashboard loads, especially on multi-panel dashboards." Avoid quoting a specific multiplier (e.g. "3x faster") unless we have a measured benchmark for that customer.

### Portal drilldown

Every Kentik panel includes a link icon that opens the Kentik portal scoped to the same query, time range, and filters as the panel. The portal URL is derived automatically from the configured region (US, EU, or custom).

### Region selector

The datasource configuration page exposes a Region picker:

- **US** (default): Kentik US endpoints (`api.kentik.com` + `grpc.api.kentik.com`)
- **EU**: Kentik EU endpoints (`api.kentik.eu` + `grpc.api.kentik.eu`)
- **Custom**: any self-hosted or private Kentik deployment (user supplies the base URL)

The portal drilldown URL also follows the selected region (`portal.kentik.com` / `portal.kentik.eu`).

### Expanded dimension library

v2.0 ships **290+ dimensions across 30+ categories**. Notable additions over v1.7:

- **Kubernetes**: pod, namespace, workload, node, etc. Group traffic by Kubernetes metadata collected by the Kentik kube agent.
- **OTT (Over-The-Top)**: classify traffic by streaming service and content provider.
- **OCI**: Oracle Cloud Infrastructure resource dimensions.
- **Expanded SNMP/ST**: additional interface counters, device metrics, vendor-specific fields.

The full set spans AWS, Azure, GCP, OCI, Kubernetes, DNS, HTTP, OTT, routing, geo, SNMP/ST, and a wide range of vendor-specific dimensions (Palo Alto, Cisco ASA / IOS XE SD-WAN / nvzFlow, Juniper PFE, Nokia L2, A10, Fortinet, VeloCloud, Silver Peak, VXLAN, and more).

### Bundled dashboards

v2.0 ships four dashboards available for **one-click import** from the datasource configuration page (Dashboards tab). They are not auto-provisioned.

| Dashboard | What it covers |
|---|---|
| **Kentik: Home** | Landing page with links to all Kentik dashboards |
| **Kentik Top Talkers** | Highest-volume sources and destinations by IP, ASN, port, and protocol. Useful for capacity planning and abuse detection |
| **Kentik: Network Health & Traffic Overview** | Layer-by-layer health: physical (SNMP errors, CPU, memory), data link (VLANs, MACs), network (IPs, ASNs, geo, IPv4/v6), transport (protocols, ports, packets/s), and application layers |
| **Kentik: Site & Device Overview** | Per-site traffic breakdown with protocol heatmap, device flow activity, and site bar chart comparison |

These rebuild and expand on the dashboards bundled with v1.7.

### Richer query editor

- **Data mode toggle**: switch between time-series (Graph) and summary (Table) output per panel.
- **Top-N control**: set the number of returned results per panel.
- **Filter builder UI**: add WHERE-clause-style filters with dimension/operator/value pickers and AND/OR conjunction.
- **Multi-dimension support**: up to 8 dimensions per query, grouped as a combination (like a SQL `GROUP BY`).

### Smart series labeling with Alias By

In v1.7, grouping by source AS produced legend entries like `15169`, which is meaningless without external context. v2.0 introduces a templating system called **Alias By** that resolves tokens against each series.

#### How it works

Type `$` or `{{` in the Alias By field and autocomplete drops down with available tokens. There are three kinds:

| Syntax | What it does |
|---|---|
| `{{field_name}}` | Primary dimension token. Resolves to the value from the series. Autocomplete inserts this for all dimensions. |
| `$col` / `$metric_group` | Built-in tokens for the aggregate label and metric group name |
| `$dashboard_var` | Grafana dashboard variables, resolved at query time |

`$tag_field_name` is also supported as legacy syntax from v1.7 and resolves identically to `{{field_name}}`, though autocomplete no longer suggests it.

The key difference between `{{...}}` and bare `$` is **per-series resolution**. The alias engine runs in two passes:

1. Grafana template variables (`$var`) are resolved first into static text.
2. Then `{{...}}` tokens are resolved against each individual series row.

This means `{{$dimension}}` works as an indirection: the variable selects the field name, and the braces resolve it per-series.

#### Practical examples

**Network traffic by AS with the aggregate label:**
```
$tag_src_as ($col)
→  15169 (Max bits/s)
```

**Device and interface for capacity planning:**
```
{{device}} / {{interface}}
→  core-router-01 / xe-0/0/1
```

**Source to destination AS pairs:**
```
$tag_src_as - $tag_dst_as
→  15169 - 16509
```

**SNMP device metrics with metric group context:**
```
$metric_group: $tag_device
→  SNMP Device CPU (%): core-router-01
```

**Geographic context with a static prefix:**
```
Prefix: Inbound
Alias:  $tag_src_geo_country ($col)
→  Inbound United States (Max bits/s)
```

**Using Grafana dashboard variables:**
```
$region: $tag_src_as
→  us-east: 15169    (when $region = us-east)
```

#### Built-in tokens

| Token | Resolves to | Example |
|---|---|---|
| `{{field}}` | Dimension value from the series (preferred; supports spaces/hyphens) | `{{Source Port}}` resolves to `443` |
| `$tag_<field>` | Same as `{{field}}`. Legacy v1.7 syntax, still supported but no longer suggested by autocomplete | `$tag_Proto` resolves to `TCP` |
| `$col` | Aggregate column label | `Max bits/s`, `95th Percentile` |
| `$metric_group` | Metric group name | `SNMP Device CPU (%)` |

#### Intelligent fallback resolution

The alias engine doesn't require exact field name matches. When a token doesn't match a response property directly, it walks through a resolution chain:

1. Exact match on the series object
2. Case-insensitive match
3. Kentik field variants (`i_<field>`, `<field>_name`)
4. SNMP/ST protocol key matching (e.g. `{{device}}` resolves against `ktappprotocol__snmp_device_metrics__i_device_name`)
5. Positional extraction from the series key by dimension index

This means you can write `{{device}}` and it will resolve correctly whether you're querying flow data, SNMP metrics, or streaming telemetry.

If a token can't be resolved at all, it's left as-is in the label (e.g. `$tag_missing` stays `$tag_missing`), so users can immediately see what needs fixing.

---

## Migration & upgrade

### Why there are two plugin IDs

The legacy app plugin (`kentik-connect-app`) is being replaced by a standalone datasource plugin (`kentik-connect-datasource`). Grafana requires datasource plugins to use a `-datasource` ID suffix, so the new plugin ships under a new ID. The bridge release of the app plugin (v1.8.0) declares the new datasource as a dependency, so updating the app plugin pulls in the datasource automatically.

### v1.8.0 is a bridge release

`kentik-connect-app` v1.8.0 is intentionally inert. Its only job is to declare a dependency on `kentik-connect-datasource` so Grafana auto-installs the new plugin. Don't use the old app pages or app-bundled dashboards on v1.8.0; they aren't supported anymore. All configuration and dashboards now live under the new datasource.

If a user reports "dashboard not found" links inside the app on v1.8.0, that is expected bridge behavior. Direct them to **Connections > Data Sources > Kentik**.

### Upgrade paths

#### Existing Kentik Grafana App users

1. Update `kentik-connect-app` to v1.8.0. This auto-installs `kentik-connect-datasource` as a dependency.
2. Update `kentik-connect-datasource` to the latest version (currently v2.0.1; v2.0.2 once published) via **Administration > Plugins**. The bridge only pulls in the initial version; later patches come through normal Grafana plugin updates.
3. Go to **Connections > Data Sources > Kentik** and enter email and API token.
4. On the datasource page, open the **Dashboards** tab and click **Import** for each of the four bundled dashboards.
5. Switch the datasource selector on existing panels to the new Kentik datasource. Filters and queries carry over automatically.
6. Once everything is migrated, `kentik-connect-app` can be disabled or uninstalled.

#### New users

1. In Grafana, go to **Connections > Add new connection**, search for **Kentik**, and install `kentik-connect-datasource`.
2. Configure the connection at **Connections > Data Sources > Kentik**.
3. Import the bundled dashboards from the Dashboards tab.

### The old app becomes inert after the bridge upgrade

After updating to `kentik-connect-app` v1.8.0, the app stops doing anything on its own. Its only job is to declare `kentik-connect-datasource` as a dependency so Grafana installs it. The v1.7-era app pages and app-bundled dashboards are gone, and the app loads with `enabled=false`.

Verified behavior (Grafana 13, Kentik app v1.8.0 + Kentik datasource v2.0.2 installed side by side):

- Both plugins register without conflict; no plugin errors reported.
- `kentik-connect-app` shows `enabled=false` (inert bridge); `kentik-connect-datasource` shows `enabled=true` with a valid signature.
- Existing Kentik datasource records are preserved across the v1.7 -> v1.8 -> v2.x upgrade.

Once dashboards have been switched to the new datasource, the legacy app plugin can be disabled or uninstalled. There's no rush to remove it, but keeping it around offers no functionality.

---

## Talking points & known caveats

### Grafana 13+ compatibility

**Status:** v2.0.0 and v2.0.1 do not save credentials correctly on Grafana 13.0+. Saving fails with "Not found" because Grafana 13 deprecated the ID-based datasource update endpoint that the plugin used.

**Resolution:** v2.0.2 switches to the UID-based endpoint (with an ID-based fallback) for full Grafana 13+ support, and is in the release pipeline.

**What to tell customers:**

- On Grafana 12.x or earlier: v2.0.1 works as expected.
- On Grafana 13.0+: hold the Grafana upgrade, or wait for v2.0.2.

### Bundled dashboards are import-on-demand, not auto-provisioned

This is standard Grafana datasource plugin behavior. Users have to open the Dashboards tab on the datasource page and click Import per dashboard. Set this expectation up front during enablement; it's the most common "where are my dashboards?" question.

### Region behavior

If a user previously configured a custom URL via raw text edits to the legacy app config, they should re-select the appropriate Region (US / EU / Custom) on the new datasource page. The plugin always derives its base URL from the Region setting; raw URL strings stored from older versions are ignored.

### NMS metrics are not yet covered

v2.0 mirrors the Data Explorer surface area only. Kentik **NMS** metrics are not exposed through this plugin yet. If a customer needs NMS-backed panels in Grafana, set that expectation explicitly and route the ask to product as a roadmap input. Do not commit to a timeline.

---

## What's next

Areas of active investment:

- Grafana alerting integration on Kentik datasource queries
- Additional bundled dashboards focused on cloud-specific workflows
- Continued Grafana version compatibility hardening (e.g. v2.0.2 for Grafana 13+)
- NMS metrics support (no committed timeline)

Anything beyond this list (AI integrations, etc.) should be treated as exploratory and not committed to in field-facing material until product confirms.

---

## References

- Plugin source: https://github.com/kentik/kentik-grafana-app
- Issue tracker: https://github.com/kentik/kentik-grafana-app/issues
- Grafana catalog: https://grafana.com/grafana/plugins/kentik-connect-datasource/
