# 1. Introduction

Kentik Connect Pro is a datasource plugin for Grafana. It allows users to query the Kentik API and visualize data on Grafana dashboards. The plugin is available under Datasources.
After installing and adding the plugin as a new datasource, the user must provide authentication details: email and API token. Once saved, the plugin automatically verifies whether the authentication is valid.

# 2. Changes and new features

## 2.1 API Update from v5 to v6

The API endpoints have been updated for:

* devices
* sites
* users
* custom dimensions
* saved filters

## 2.2 Cache implementation (localForage)

A caching mechanism using localForage has been introduced. The cache applies to both dashboard query results and the API endpoints:

* devices
* sites
* saved filters
* custom dimensions

Cache refresh frequency is based on the query time range and follows the previous logic:

* Range > 1 month → refresh every 1 hour
* Range > 1 day and ≤ 1 month → refresh every 15 minutes
* Range ≤ 1 day → refresh every 5 minutes

Thanks to caching, the query builder and dashboards load much faster after page reloads when cached data is available.

## 2.3 Visualization depth

A new configuration field named Visualization depth has been added, defining the number of returned results.

* type: numeric value
* default value: 8

## 2.4 Label name changes

* Unit → Metric
* Metric → Dimensions

## 2.5 Multi-Select support

Multi-selection has been added for:

* sites
* devices
* dimensions (maximum 8)

If a user selects 8 dimensions, the following message appears: Max 8 dimensions allowed, and all options are disabled. When the user unselect some dimension, all options are enabled again.

## 2.6 Drilldown for graphs and tables

A drilldown feature has been added. Using the endpoint:

```
/api/v5/query/url
```

The plugin generates a drilldown link, which is attached to the returned data. Users can find this link in the tooltip.

## 2.7. Aliases

A single query containing multiple aggregates and aggregateTypes is now split into multiple individual queries.

Each generated query contains exactly one aggregate and one corresponding aggregateType.

This ensures that each aggregate is processed independently and produces its own time series.

### Alias Behavior

#### Default Alias (no user-defined alias)

If the user does not provide a custom alias, the system automatically appends the aggregate name to the generated series label.

#### Custom Alias (user-defined)

When the user specifies an alias, two types of substitutions are supported:

* $col
  Replaced with the name of the aggregate used in the current query.

* $tag_*
  Replaced with values from the fields returned in the series data.

If a referenced field does not exist in the data, the placeholder is left unchanged.

## 2.8. New metrics and dimensions

New metrics and dimensions added to the query builder.

# 3. Running the plugin (development mode)

The plugin is located on the plugin-v12 branch.

## 3.1 Steps to run:

* Switch to the plugin-v12 branch.
* Inside the kentik-kentikconnectpro-datasource folder, install dependencies:

  ```
  npm install
  ```
* Start the development server:

  ```
  npm run dev
  ```
* In a separate terminal, in the same folder, start Docker services:

  ```
  docker compose up
  ```

* Run the tests:

   ```
   npm run test
   ```

## 3.2. Accessing Grafana

Grafana should be available at:

```
http://localhost:3000
```

## 3.3 Required Node.js version

The recommended Node.js version is: v22.17.0

Older Node versions caused issues with Web Crypto (WCS), ESM module compatibility, and Grafana toolchain dependencies. Node 22 ensures full compatibility with the plugin toolchain and prevents build/runtime errors.

# 4. Summary

The plugin provides improved performance through caching, updated API v6 support, enhanced configuration options, and drilldown functionality. The development version is easy to run locally and compatible with modern Node.js and Grafana versions.


# Distributing your plugin

When distributing a Grafana plugin either within the community or privately the plugin must be signed so the Grafana application can verify its authenticity. This can be done with the `@grafana/sign-plugin` package.

_Note: It's not necessary to sign a plugin during development. The docker development environment that is scaffolded with `@grafana/create-plugin` caters for running the plugin without a signature._
