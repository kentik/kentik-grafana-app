# Kentik for Grafana

The Kentik datasource plugin allows you to query the Kentik API and visualize network traffic data directly in Grafana. It leverages the **Kentik Network Observability Platform** to provide real-time, Internet-scale ingest and querying of network data including flow records (NetFlow, IPFIX, sFlow), BGP, GeoIP, and SNMP.

The plugin provides instant access to the **Kentik Data Engine (KDE)**, enabling you to seamlessly integrate network activity metrics into your Grafana dashboards.

## Requirements

- A Grafana instance (v10.4 or later)
- An active **Kentik account** with API access
- Devices registered in the Kentik portal

## Getting Started

1. Navigate to **Data Sources** in Grafana.
2. Add **Kentik**.
3. Select the appropriate **Region** (US, EU, or Custom).
4. Enter your Kentik **Email** and **API Token**.
5. Click **Save & Test** to verify connectivity.

## Features

- **Granular Visibility**: View traffic by time range, devices, sites, and over 200 dimensions across 20+ categories.
- **Multi-Select Support**: Select multiple sites, devices, and up to 8 dimensions simultaneously.
- **NMS / SNMP Support**: Query SNMP device and interface metrics alongside traditional flow data.
- **Smart Labeling**: Customize graph legends using Alias and Prefix fields with autocomplete (e.g., `{{Source Interface}}`, `$col`, `$metric_group`).
- **Drilldown Workflows**: Deep-link URLs to the Kentik Portal for detailed investigation.

## Documentation

For more information, visit [Kentik Documentation](https://kb.kentik.com/).
