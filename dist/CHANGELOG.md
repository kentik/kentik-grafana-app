# Change Log

All notable changes to this project will be documented in this file.

## [1.5.0] - 2021-08-06

### Breaking changes

Plugin ID is changed according to [Grafana convention](https://grafana.com/docs/grafana/v7.5/developers/plugins/legacy/review-guidelines/#pluginjson): `kentik-app` -> `kentik-connect-app`.

**Please refer to the updated installation instructions before updating.** 
It's important to **remove the existing plugin** and **enable the plugin in Grafana again**.

## [1.4.2] - 2021-05-21

### Fixed

- Filter field "inet_dst_addr" does not support the operator "=" error [#36](https://github.com/kentik/kentik-grafana-app/pull/36)

### Changed
- Remove old unsupported filters

## [1.4.1] - 2020-09-25

### Fixed

- 403 error when using non-admin Kentik user [#31](https://github.com/kentik/kentik-grafana-app/issues/31)

## [1.4.0] - 2019-12-26

### Breaking changes

Fixed "Permission denied" error for Viewers and Editors [#28](https://github.com/kentik/kentik-grafana-app/pull/28).

Because of [#28](https://github.com/kentik/kentik-grafana-app/pull/28) it's required to do after update:
- restart Grafana
- go to the plugin config (e.g. http://localhost:3000/plugins/kentik-app/) and click "Update"

## [1.3.6] - 2019-10-02

### New Features

- Resolve IPs in a given view [#5](https://github.com/kentik/kentik-grafana-app/issues/5)

## [1.3.5] - 2019-09-23

Autocomplete for plugin #4

## [1.3.4] - 2019-05-24

- Added support for custom api endpoints, [#71](https://github.com/grafana/kentik-app/issues/71)


## [1.3.3] - 2019-02-01

### New Features
- Added support for EU api endpoint, [#64](https://github.com/grafana/kentik-app/issues/64)

### Fixed
- click-through to device-details page now works correctly

### Changed
- Updated device-details page to show more data
- device-details page now displays more informative messages when updating fails

## [1.3.2] - 2018-12-18

### New Features
- Added better error messaging for API issues, [#61](https://github.com/grafana/kentik-app/issues/61)

## [1.3.1] - 2018-11-13

### Fixed

- Filter operators do not match Group By operators, [#37](https://github.com/grafana/kentik-app/issues/37)

## [1.3.0] - 2018-10-22

### New Features

- Custom dimensions support [#46](https://github.com/grafana/kentik-app/issues/46)
- Direct filter import (using saved filters in Grafana) [#45](https://github.com/grafana/kentik-app/issues/45)

## [1.2.4] - 2017-05-22

### New Features

- Test for Kentik query builder

### Changed

- Enable stacking by default in Kentik top talkers dashboard

### Fixed

- Unique Src/Dst IPs metrics (after Kentik API update)
- Table data columns for Unique Src/Dst IPs metrics (now is Avg, p95th, Max, p95th mbps, p95th pps)
