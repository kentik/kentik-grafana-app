# Kentik Datasource — Test Environment

## Quick Start

```bash
# 1. Build the plugin
npm ci && npm run build

# 2. Start Grafana with the plugin loaded
docker compose up -d

# 3. Open Grafana at http://localhost:3000 (anonymous admin access)
```

## Provisioned Resources

### Datasource

The Kentik datasource is pre-configured at `provisioning/datasources/datasources.yml`.

**To complete setup**, navigate to **Connections → Data Sources → Kentik** and enter:

- **Email** — Your Kentik account email
- **API Token** — Generated from [Kentik portal](https://portal.kentik.com) → My Account → API

Click **Save API Settings**, then **Save & Test** to verify connectivity.

### Dashboards

Four dashboards are auto-provisioned into the **Kentik** folder:

| Dashboard                                     | Description                                             |
| --------------------------------------------- | ------------------------------------------------------- |
| **Kentik: Home**                              | Landing page with links to other dashboards             |
| **Kentik: Network Health & Traffic Overview** | OSI-layer organized panels (SNMP, flow, geo, transport) |
| **Kentik Top Talkers**                        | Variable-driven top-N analysis by dimension/metric      |
| **Kentik: Site & Device Overview**            | Heatmap, status history, and bar chart visualizations   |

### Docker Compose

- **Grafana version**: Configurable via `GRAFANA_IMAGE` / `GRAFANA_VERSION` env vars (defaults to `grafana-enterprise:12.4.1`)
- **Anonymous auth**: Enabled by default for easy testing (`Admin` role)
- **Plugin signing**: Unsigned plugins allowed in development mode
- **Logs**: Debug-level logging enabled for the plugin (`GF_LOG_FILTERS=plugin.kentik-datasource:debug`)

## Requirements

- A [Kentik](https://www.kentik.com) account with API access (free trial available)
- Docker and Docker Compose

For more information see [Provision dashboards and data sources](https://grafana.com/tutorials/provision-dashboards-and-data-sources/)
