# Testing the Kentik Datasource Plugin

This document describes how to set up a local test environment for the Kentik
datasource plugin for Grafana plugin review purposes.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) and Docker Compose
- Node.js 24+
- A Kentik account with API access ([free trial available](https://portal.kentik.com/signup.html))
- Your Kentik **email address** and **API token** (found at
  [app.kentik.com → Settings → API](https://app.kentik.com/#/settings/api))

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/kentik/kentik-grafana-app.git
cd kentik-grafana-app
```

### 2. Build the plugin

```bash
npm install
npm run build
```

### 3. Start Grafana

```bash
docker compose up --build
```

Grafana will be available at **http://localhost:3000**

Default credentials: `admin` / `admin`

### 4. Configure credentials

The datasource is pre-provisioned but requires your Kentik credentials:

1. Go to **Connections → Data Sources → Kentik**
2. Enter your Kentik **email** and **API token**
3. Click **Save & test** — you should see "Data source is working"

## What You'll See

Once running, Grafana will have:

- **Kentik datasource** pre-configured under Connections → Data Sources
- **4 pre-built dashboards** under the "Kentik" folder:
  - **Kentik Home** — overview of top traffic by dimension
  - **Top Talkers** — top source/destination IPs, ASNs, and ports
  - **OSI Health** — layer-by-layer network health metrics
  - **Site Overview** — per-site traffic breakdown

## Verifying the Plugin

### Query editor

1. Open any pre-built dashboard and click a panel → **Edit**
2. The query editor exposes:
   - **Data Mode** — Graph or Table
   - **Sites / Devices** — populated from your Kentik account
   - **Dimensions** — 200+ flow, BGP, GeoIP, DNS, cloud, and SNMP dimensions
   - **Metric** — bits, packets, unique IPs, etc.
   - **Filters** — custom filter expressions
   - **Alias by** — `$tag_<field>` or `{{field}}` variable substitution

### Creating a query from scratch

1. Go to **Dashboards → New → New Dashboard → Add visualization**
2. Select **Kentik** as the data source
3. Set a time range with known traffic (e.g. last 6 hours)
4. Choose a Dimension (e.g. `Source IP`) and Metric (e.g. `Bits/s`)
5. Click **Run query** — results should populate within a few seconds

## Grafana Version Compatibility

| Grafana Version | Status |
|---|---|
| 11.6.x | ✅ Minimum supported |
| 12.4.x | ✅ Tested |
| latest | ✅ Tested in CI |

## Region Support

| Region | API Endpoint |
|---|---|
| US (default) | `https://api.kentik.com` |
| EU | `https://api.kentik.eu` |
| Custom | Configurable in datasource settings |

To test with the EU region, change **Region** to `EU` in the datasource
configuration page and re-enter your credentials.

## Troubleshooting

**"Plugin unavailable" on dashboards**
The datasource credentials haven't been saved yet. Go to Connections → Data
Sources → Kentik, enter your credentials, and click Save & test.

**"Data source is not responding"**
Check that your API token has read access enabled in the Kentik portal under
Settings → API Tokens.

**No data in panels**
Ensure the selected time range covers a period with traffic data in your Kentik
account. Try "Last 24 hours" as a starting point.
