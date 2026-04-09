# Kentik for Grafana

Bring the full power of the **Kentik Network Observability Platform**
into Grafana. Query flow records (NetFlow, IPFIX, sFlow), BGP, GeoIP,
SNMP, and streaming telemetry - all from a single datasource - and
visualize network traffic alongside the rest of your infrastructure.

## Why Kentik for Grafana?

- **Fast dashboards** - a built-in batch query scheduler combines
  multi-panel dashboards into a single API call, cutting load times
  by 3–5×.
- **290+ dimensions** - group traffic by IP, port, protocol, AS,
  geography, cloud resource, Kubernetes workload, OTT provider,
  SNMP interface, and more.
- **One-click portal drilldown** - every panel links directly to
  the Kentik portal scoped to the same query, time range, and
  filters.
- **Four ready-to-use dashboards** - Home, Top Talkers, Network
  Health (OSI layers), and Site & Device Overview are provisioned
  automatically.
- **Multi-region** - first-class support for US, EU, and
  custom-hosted Kentik deployments.

## Getting Started

1. Navigate to **Connections → Data sources** in Grafana.
2. Search for **Kentik** and add the datasource.
3. Select your **Region** (US, EU, or Custom).
4. Enter your Kentik **Email** and **API Token**.
5. Click **Save & Test** - the plugin validates connectivity
   with the Kentik API.
6. Explore the dashboards in the **Kentik** folder, or build
   your own.

## Requirements

- Grafana **11.6** or later
- An active [Kentik account](https://www.kentik.com/get-started/)
  with API access

## Upgrading from kentik-connect-app?

If you're migrating from the v1.x `kentik-connect-app` plugin,
the transition is seamless - your existing dashboards continue to
work without changes. Update to `kentik-connect-app` v1.8.0
first (a bridge that auto-installs v2.0), then configure the new
datasource with your credentials.

## Documentation

- [Kentik Documentation](https://kb.kentik.com/)
- [GitHub](https://github.com/kentik/kentik-grafana-app)

