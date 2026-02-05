# Kentik Connect Pro for Grafana

Kentik Connect Pro allows you to query the Kentik API and visualize network traffic data directly in Grafana. It leverages the power of **Kentik Detect** to provide real-time, Internet-scale ingest and querying of network data including flow records (NetFlow, IPFIX, sFlow), BGP, GeoIP, and SNMP.

The plugin provides instant access to the **Kentik Data Engine (KDE)**, enabling you to seamlessly integrate network activity metrics into your Grafana dashboards with improved performance and flexibility.

## Features

* **Granular Visibility**: View traffic by time range, devices, sites, and over 30 source/destination dimensions.
* **Multi-Select Support**: Select multiple sites, devices, and up to 8 dimensions simultaneously for complex queries.
* **Smart Labeling**: Customize graph legends using the **Alias** and **Prefix** fields with intelligent autocomplete (e.g., `{{Source Interface}}` or `$tag_...`).
* **Drilldown Workflows**: Automatically generates deep-link URLs to the Kentik Portal for detailed investigation of specific data points.
* **High Performance**: Integrated caching ensures fast dashboard loading and responsive query building.
* **Flexible Visualization**:
  * Control the number of returned results with **Visualization Depth**.
  * View Max, 95th percentile, and Average values in sortable tables.

## Configuration

### Authentication

To enable the datasource:


1. Navigate to **Data Sources** in Grafana.
2. Add **Kentik Connect Pro**.
3. Enter your Kentik **Email** and **API Token**.
4. Click **Save & Test** to verify connectivity.

### Terminology

* **Dimensions** (formerly Metric): Attributes used to segment data (e.g., Device, Site, Interface).
* **Metric** (formerly Unit): The numerical value being measured (e.g., Bits/s, Packets/s).

## External Dependencies

* **Kentik Account**: An active Kentik account and API key are required.
* **Device Registration**: Devices must be configured in Kentik Detect to appear in the plugin.

## Development

This project requires **Node.js v22.17.0** or higher and **Docker**.

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
To produce a build of the plugin you will need Docker. If you want to build locally without Docker then you can reference the Dockerfile for the required dependencies.

To create a local package, use make:

*Note: you will need to have a Grafana API Key in order to create a build as the package is signed.*

```bash
make GRAFANA_API_KEY=$GRAFANA_API_KEY
```

If the build succeeds, it will produce an archive named `kentik-connect-app-dev.zip`.

To specify a version, use the `VERSION` environment variable:

```bash
make GRAFANA_API_KEY=$GRAFANA_API_KEY VERSION=1.5.0
```

This will produce an archive named `kentik-connect-app-1.5.0.zip`.

To add extra signing arguments use the `SIGN_ARGS` environment variable. For example, to specify a private archive for use on the `https://grafana-test.kentiklabs.com` domain:

```bash
make GRAFANA_API_KEY=$GRAFANA_API_KEY SIGN_ARGS="--rootUrls https://grafana-test.kentiklabs.com"
```

## Useful links
Grafana docs about Docker installation: https://docs.grafana.org/installation/docker/#installing-plugins-from-other-sources


