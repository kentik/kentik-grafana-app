[![CircleCI](https://circleci.com/gh/grafana/kentik-app.svg?style=svg)](https://circleci.com/gh/grafana/kentik-app)
[![David Dependancy Status](https://david-dm.org/grafana/kentik-app.svg)](https://david-dm.org/grafana/kentik-app)
[![David Dev Dependency Status](https://david-dm.org/grafana/kentik-app/dev-status.svg)](https://david-dm.org/grafana/kentik-app/?type=dev)



Kentik Connect for Grafana allows you to quickly and easily enhance your visibility into your network traffic. Kentik Connect leverages the power of Kentik Detect, which provides real-time, Internet-scale ingest and querying of network data including flow records (NetFlow, IPFIX, sFlow), BGP, GeoIP, and SNMP. Stored in the Kentik Data Engine (KDE), Kentik Detect’s distributed post-Hadoop Big Data backend, this information is a rich source of actionable insights into network traffic, including anomalies that can affect application or service performance. Kentik Connect provides Grafana with instant access to KDE, enabling you to seamlessly integrate network activity metrics into your Grafana dashboard.

## Features

Kentik Connect for Grafana ships with an official Kentik Data Source, the database connector that allows you to read and visualize data directly from KDE. Within the Grafana environment, you can specify the parameters of the traffic that you want Kentik Connect to display:

- Timespan: set the time range for which you want to see traffic data.
- Devices: view traffic from all devices or individual routers, switches, or hosts.
- Dimensions: group by over 30 source and destination dimensions representing NetFlow, BGP, or GeoIP data.
- Metrics: display data in metrics including bits, packets, or unique IPs.
- Sort: visualizations are accompanied by a sortable table showing Max, 95th percentile, and Average values.

Kentik Connect also allows you to edit the configuration of devices (which must already be registered with Kentik Detect). And, as with any Grafana dashboard, current settings can be managed (Manage dashboard menu) and dashboards can be saved, shared, and starred.

## External Dependencies

- A Kentik account and API key is required to Enable the Kentik app. If you don’t have a Kentik account, [sign up for your Free Trial Now](https://portal.kentik.com/signup.html?ref=signup_2nd&utm_source=grafana&utm_medium=landingpage&utm_term=portal&utm_campaign=grafana-signup).
- To appear in the Kentik Connect device list, devices must first be registered with Kentik Detect.

## Plugin installation

The easiest way to install plugins is by using the `grafana-cli` tool which is bundled with Grafana. See [Using grafana-cli](#using-grafana-cli) paragraph.

If there is no `grafana-cli` tool in your system, plugins can be installed [manually](#manual-installation).

### Table of contents
- [Using grafana-cli](#using-grafana-cli)
  - [Install plugin](#install-plugin)
  - [Update plugin](#update-plugin)
- [Manual installation](#manual-installation)
- [Docker installation](#docker-installation)

### Using grafana-cli

Grafana docs about plugin installation: https://grafana.com/docs/plugins/installation/#installing-plugins.

#### Install / update plugin
```bash
grafana-cli --pluginUrl "https://github.com/kentik/kentik-grafana-app/releases/download/v1.4.2/kentik-app-1.4.2.zip" plugins install kentik-app
sudo systemctl restart grafana-server
```

### Manual installation

- Navigate to Grafana plugins directory:
  - For Grafana installed from `.deb`/`.rpm` package:
    - `/var/lib/grafana/plugins`
  - For Grafana installed using Standalone Linux Binaries or source:
    - `<GRAFANA_PATH>/data/plugins`

- Download kentik-app
```bash
wget https://github.com/kentik/kentik-grafana-app/releases/download/v1.4.2/kentik-app-1.4.2.tar.gz
```

- Remove old kentik-app (if it exists)
```bash
rm -rf kentik-app
```

- Unpack downloaded files
```bash
tar -zxvf kentik-app-1.4.2.tar.gz
```

- Restart Grafana
  - For Grafana installed from `.deb`/`.rpm` package:
    - `systemctl restart grafana-server`
  - For Grafana installed using Standalone Linux Binaries or source:
    - Stop any running instances of grafana-server
    - Start grafana-server: `cd <GRAFANA_PATH> && ./bin/grafana-server`

### Docker installation

You can install Kentik App to Grafana in Docker passing it as the environment variable.

```bash
docker run \
  -p 3000:3000 \
  -e "GF_INSTALL_PLUGINS=https://github.com/kentik/kentik-grafana-app/releases/download/v1.4.2/kentik-app-1.4.2.zip;kentik-grafana-app" \
  grafana/grafana
```

#### Useful links
- Grafana docs about Docker installation: https://docs.grafana.org/installation/docker/#installing-plugins-from-other-sources
