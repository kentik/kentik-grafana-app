# Kentik Grafana Plugin: What's New

A comprehensive comparison between the legacy **Kentik Connect Pro** (`kentik-connect-app` v1.7) and the new **Kentik Datasource** (`kentik-datasource`).

---

## At a Glance

| | Kentik Connect Pro (Legacy) | Kentik Datasource (New) |
|---|---|---|
| **Plugin ID** | `kentik-connect-app` | `kentik-datasource` |
| **Plugin Type** | App (wrapper with bundled datasource + panels) | Standalone Datasource |
| **Grafana UI** | Legacy `Select`, `HorizontalGroup` | Modern `Combobox`, `MultiCombobox`, `Stack` |
| **Grafana Compatibility** | Grafana 7–9 era | Grafana ≥ 10.4 |
| **Dimensions** | 115 (single-select only) | 202 across 20+ categories (multi-select, up to 8) |
| **SNMP / NMS** | Not supported | Full support (device metrics, interface metrics, streaming telemetry) |
| **Alias / Legend** | Basic `$tag_` prefix only | Intelligent autocomplete with `{{tag}}`, `$col`, `$metric_group`, context-aware suggestions |
| **Metrics per Query** | Single aggregate | Multiple aggregates per query (individual series per aggregate) |
| **Test Coverage** | 3 test files | 7 test suites, 117 tests |
| **Region Support** | Hardcoded US endpoint | US, EU, and Custom region selector |

---

## Architecture

### Legacy: App Plugin Wrapper

The old plugin was a Grafana **App** (`type: "app"`) that bundled:
- A datasource plugin
- A description panel plugin
- Pre-built dashboards (Home, Top Talkers)

This architecture required Grafana to enable the "app" first before the datasource became available — an extra step that confused users.

### New: Standalone Datasource

The new plugin is a **standalone datasource** (`type: "datasource"`). It installs and configures directly in Grafana's Data Sources section with no app wrapper required. Bundled dashboards and the description panel are still included but ship as part of the datasource package.

---

## Feature Comparison

### Query Builder

| Capability | Legacy | New |
|---|---|---|
| Dimension selection | Single dropdown (`Select`) | `MultiCombobox` — select up to 8 simultaneously |
| Dimension count | 115 static entries in one file | 202 entries organized across modular category files |
| Dimension categories | None | 20+ typed categories (General, Interface, Routing, Cloud, SNMP, Kubernetes, etc.) |
| Metric selection | Single "Unit" dropdown | Multi-select with nested grouped options |
| Multiple aggregates | ❌ One aggregate per query | ✅ Each aggregate gets its own series |
| SNMP / ST dimensions | ❌ | ✅ Full support for `ktappprotocol__` dimension families |
| SNMP / ST metrics | ❌ | ✅ SNMP Device CPU, Interface metrics, Streaming Telemetry |
| Custom filters | Basic | Full Combobox-based filter builder with key/operator/value |
| Query validation | None | Real-time validation with field-level error messages |
| DNS Lookup | ❌ | ✅ Configurable hostname lookup |

### Alias & Legend Customization

| Capability | Legacy | New |
|---|---|---|
| Prefix field | Basic `templateSrv.replace()` | Full autocomplete with dimension suggestions |
| Alias field | Not supported (prefix + series key only) | Full `{{tag}}` and `$tag_` pattern support with autocomplete |
| `$col` token | ❌ | ✅ Resolves to friendly aggregate label (e.g., "95th Percentile") |
| `$metric_group` token | ❌ | ✅ Resolves to metric group name (e.g., "SNMP Device CPU (%)") |
| `{{dimension}}` tags | ❌ | ✅ Auto-injects referenced dimensions into API query |
| SNMP-aware aliases | ❌ | ✅ `{{device}}` resolves correctly for both flow and SNMP queries |
| Context-aware suggestions | ❌ | ✅ Dropdown only shows dimensions valid for current query type |
| Dashboard variable support | Basic | ✅ Variables shown in suggestions, `text` format for multi-value |

### Data Processing

| Capability | Legacy | New |
|---|---|---|
| Time series output | Legacy `target` + `datapoints` format | Modern Grafana `DataFrame` with typed fields |
| SNMP scalar data | ❌ Ignored (no timeSeries) | ✅ Rendered as flat two-point series spanning query range |
| Drilldown links | ❌ | ✅ "Open in Kentik" link on every series (deep-link to Data Explorer) |
| Per-aggregate queries | Single outsort | Iterates each aggregate → individual API call → separate series |

### Configuration

| Capability | Legacy | New |
|---|---|---|
| Region | Hardcoded US | US, EU, Custom with URL configuration |
| Authentication | Email + Token | Email + Token (same) |
| Save & Test | Basic connectivity check | Connectivity check + cache clear on credential change |
| Metadata caching | ❌ | ✅ 5-minute TTL cache for devices, sites, custom dimensions |

---

## Developer Experience

| | Legacy | New |
|---|---|---|
| **Codebase** | Single `metric_def.ts` (115 dimensions), monolithic | Modular dimension files by category, typed enums |
| **DataSource.ts** | 371 lines | 827 lines |
| **QueryEditor.tsx** | 369 lines | 1,350 lines |
| **Type safety** | Minimal (`any` throughout) | `DimensionClass`, `DimensionCategory`, `MetricCategory` enums |
| **Test suites** | 3 files | 7 suites, 117 tests |
| **Test coverage** | Basic proxy + query builder | + API contract validation, dimension integrity, query integration |
| **Build tooling** | Makefile + Docker + `@grafana/toolkit` | `create-plugin` scaffolding + `@grafana/sign-plugin` |
| **Signed build** | `make GRAFANA_API_KEY=...` | `./scripts/build-signed.sh` |

---

## Migration Considerations

### For End Users

- **New plugin ID**: This is a new plugin (`kentik-datasource`), not an upgrade to `kentik-connect-app`. Both can coexist during migration.
- **Dashboard updates**: Existing dashboards using the old datasource will need to be re-pointed to the new datasource.
- **Query compatibility**: The core Kentik API contract is the same. Queries built in the old plugin should produce equivalent results when recreated in the new one.
- **New capabilities**: SNMP queries, multi-dimension selection, and alias patterns are available immediately after switching.

### For Administrators

- **Region configuration**: If using Kentik EU, select the EU region during datasource setup (previously required manual URL editing).
- **No app enablement required**: The new plugin works as a standalone datasource — no need to enable an app first.
- **Side-by-side**: Install the new plugin alongside the legacy one, migrate dashboards panel-by-panel, then remove the old plugin.

---

## Version Strategy

This plugin represents a ground-up rebuild with a new plugin ID (`kentik-datasource` vs `kentik-connect-app`), a new plugin type (`datasource` vs `app`), and modern Grafana API compatibility (≥ 10.4). It is published as a **new plugin** in the Grafana marketplace rather than a major version bump of the legacy plugin because:

1. **Different plugin type** — Grafana does not support changing a plugin's type from `app` to `datasource` in-place.
2. **No automatic migration path** — Existing datasource configurations and dashboard bindings reference `kentik-connect-app`; a new ID avoids breaking existing installations.
3. **Clean slate** — Starting at `1.0.0` signals to users that this is a new product with its own lifecycle, not a patch on top of legacy code.

The legacy `kentik-connect-app` will remain available for users on older Grafana versions.
