# Kentik for Grafana

The Kentik datasource plugin allows you to query the Kentik API and visualize network traffic data directly in Grafana. It leverages the **Kentik Network Observability Platform** to provide real-time, Internet-scale ingest and querying of network data including flow records (NetFlow, IPFIX, sFlow), BGP, GeoIP, and SNMP.

The plugin provides instant access to the **Kentik Data Engine (KDE)**, enabling you to seamlessly integrate network activity metrics into your Grafana dashboards with improved performance and flexibility.

## Features

- **Granular Visibility**: View traffic by time range, devices, sites, and over 200 dimensions across 20+ categories (interfaces, routing, cloud, SNMP, and more).
- **Multi-Select Support**: Select multiple sites, devices, and up to 8 dimensions simultaneously for complex queries.
- **NMS / SNMP Support**: Query SNMP device and interface metrics alongside traditional flow data.
- **Smart Labeling**: Customize graph legends using the **Alias** and **Prefix** fields with intelligent autocomplete (e.g., `{{Source Interface}}`, `$col`, `$metric_group`).
- **Drilldown Workflows**: Automatically generates deep-link URLs to the Kentik Portal for detailed investigation of specific data points.
- **High Performance**: Integrated caching ensures fast dashboard loading and responsive query building.
- **Flexible Visualization**:
  - Control the number of returned results with **Visualization Depth**.
  - View Max, 95th Percentile, and Average values in sortable tables.

## Configuration

### Authentication

To enable the datasource:

1. Navigate to **Data Sources** in Grafana.
2. Add **Kentik**.
3. Select the appropriate **Region** (US, EU, or Custom).
4. Enter your Kentik **Email** and **API Token**.
5. Click **Save & Test** to verify connectivity.

### Terminology

- **Dimensions**: Attributes used to segment data (e.g., Device, Site, Interface, Source IP).
- **Metric**: The numerical value being measured (e.g., Bits/s, Packets/s, Retransmits).

## External Dependencies

- **Kentik Account**: An active Kentik account and API key are required.
- **Device Registration**: Devices must be registered in the Kentik portal to appear in the plugin.

## Development

This project requires **Node.js v22** or higher and **Docker**.

1.  **Install dependencies**:

    ```bash
    npm install
    ```

2.  **Start the development server** (watch mode):

    ```bash
    npm run dev
    ```

3.  **Run Grafana**:
    In a separate terminal, start the Docker container:

    ```bash
    docker compose up
    ```

    Grafana will be accessible at `http://localhost:3000`.

4.  **Run Tests**:
    ```bash
    npm run test
    ```

## Build

To produce a development build:

```bash
npm run build
```

### Signed Build

To build, sign, and package the plugin for distribution, use the signing script. A **Grafana API key** is required:

```bash
GRAFANA_API_KEY=<your-key> ./scripts/build-signed.sh
```

This produces `kentik-datasource-dev.zip`.

To specify a version:

```bash
GRAFANA_API_KEY=<your-key> ./scripts/build-signed.sh --version 1.5.0
```

This produces `kentik-datasource-1.5.0.zip`.

To restrict signing to a specific Grafana instance:

```bash
GRAFANA_API_KEY=<your-key> ./scripts/build-signed.sh --root-urls https://grafana-test.kentiklabs.com
```

## Useful links

- [Grafana plugin development](https://grafana.com/developers/plugin-tools/)
- [Kentik Documentation](https://kb.kentik.com/)
- [Grafana Docker installation](https://docs.grafana.org/installation/docker/#installing-plugins-from-other-sources)
