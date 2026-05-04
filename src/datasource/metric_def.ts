// Re-export types from metric_types.ts (single source of truth)
export type { TransformFunction, Dimension, Metric, MetricGroup, FilterField } from './metric_types';

export { DimensionClass, DimensionCategory, MetricCategory, METRIC_TYPE } from './metric_types';

import { METRIC_TYPE, DimensionCategory, type Dimension, type Metric, type MetricGroup, type FilterField, type MetricOptionInput } from './metric_types';

// Import dimensionList from the modular dimension files
import { dimensionList as _dimensionList } from './dimensions/index';

/**
 * Flatten metricNestedList groups into a flat array of fully-resolved Metric objects.
 *
 * This is the SINGLE place where derived / default fields are applied.
 * Individual option definitions only need to specify what's unique to them
 * (value, fn, label, and optionally rank or sample_rate override).
 *
 * Fields injected here:
 *   • raw: true          — tells the Kentik API to return timeSeries data
 *   • name               — always equals value
 *   • origLabel          — always equals label
 *   • group              — always equals the parent group's label
 *   • sample_rate        — defaults to 1 (option can override, e.g. 0.01)
 *   • unit               — from the group level (option can override)
 *   • column             — from the group level (option can override)
 */
export function flattenMetricOptions(groups: MetricGroup[]): Metric[] {
  return groups.flatMap((group) =>
    group.options.map((opt: MetricOptionInput): Metric => ({
      value: opt.value,
      column: opt.column ?? group.column,
      fn: opt.fn,
      label: opt.label,
      unit: opt.unit ?? group.unit,
      group: group.label,
      origLabel: opt.label,
      sample_rate: opt.sample_rate ?? 1,
      raw: true,
      name: opt.value,
      ...(opt.rank !== undefined ? { rank: opt.rank } : {}),
      ...(opt.tableField ? { tableField: opt.tableField } : {}),
    }))
  );
}

// dimensionList is now imported from the modular dimension files (dimensions/index.ts)
export const dimensionList: Dimension[] = _dimensionList;

export const filterFieldList: FilterField[] = [
  { text: 'Source City', field: 'src_geo_city' },
  { text: 'Source Region', field: 'src_geo_region' },
  { text: 'Source Country', field: 'src_geo' },
  { text: 'Source AS Number', field: 'src_as' },
  { text: 'Source Flow Tag', field: 'src_flow_tags', unequatable: true },
  { text: 'Source IP Port', field: 'l4_src_port' },
  { text: 'Source MAC Address', field: 'src_eth_mac' },
  { text: 'Source VLAN', field: 'vlan_in' },
  { text: 'Source IP Address', field: 'inet_src_addr', unequatable: true },
  { text: 'Source Interface ID', field: 'input_port' },
  { text: 'Source Interface Name', field: 'i_input_interface_description' },
  { text: 'Source Interface Description', field: 'i_input_snmp_alias' },
  { text: 'Source Route LEN', field: 'src_route_length' },
  { text: 'Source BGP AS_PATH', field: 'src_bgp_aspath' },
  { text: 'Source BGP Community', field: 'src_bgp_community' },
  { text: 'Source Next Hop AS Number', field: 'src_nexthop_as' },
  { text: 'Source 2nd BGP_HOP AS Number', field: 'src_second_asn' },
  { text: 'Source 3nd BGP_HOP AS Number', field: 'src_third_asn' },
  { text: 'Destination City', field: 'dst_geo_city' },
  { text: 'Destination Region', field: 'dst_geo_region' },
  { text: 'Destination Country', field: 'dst_geo' },
  { text: 'Destination AS Number', field: 'dst_as' },
  { text: 'Destination Flow Tag', field: 'dst_flow_tags', unequatable: true },
  { text: 'Destination IP Port', field: 'l4_dst_port' },
  { text: 'Destination MAC Address', field: 'dst_eth_mac' },
  { text: 'Destination VLAN', field: 'vlan_out' },
  { text: 'Destination IP Address', field: 'inet_dst_addr', unequatable: true },
  { text: 'Destination Interface ID', field: 'output_port' },
  { text: 'Destination Interface Name', field: 'i_output_interface_description' },
  { text: 'Destination Interface Description', field: 'i_output_snmp_alias' },
  { text: 'Destination Route LEN', field: 'dst_route_length' },
  { text: 'Destination BGP AS_PATH', field: 'dst_bgp_aspath' },
  { text: 'Destination BGP Community', field: 'dst_bgp_community' },
  { text: 'Destination Next Hop AS Number', field: 'dst_nexthop_as' },
  { text: 'Destination 2nd BGP_HOP AS Number', field: 'dst_second_asn' },
  { text: 'Destination 3nd BGP_HOP AS Number', field: 'dst_third_asn' },
  { text: 'TCP Flags', field: 'tcp_flags' },
  { text: 'TCP Flags (raw)', field: 'tcp_flags_raw' },
  { text: 'Protocol', field: 'protocol' },
  { text: 'INET Family', field: 'inet_family' },
  { text: 'Device Name', field: 'i_device_name' },
  { text: 'TOS/Diffserv', field: 'tos' },
];

export const metricNestedList = [
  {
    label: 'Bits/s',
    column: 'f_sum_both_bytes',
    unit: 'bytes',
    options: [
      {
        value: 'avg_bits_per_sec',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_bits_per_sec',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
      },
      {
        value: 'p99th_bits_per_sec',
        fn: 'percentile',
        label: '99th Percentile',
        rank: 99,
      },
      {
        value: 'max_bits_per_sec',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.RATE,
  },
  {
    label: 'Packets/s',
    column: 'f_sum_both_pkts',
    unit: 'packets',
    options: [
      {
        value: 'avg_pkts_per_sec',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_pkts_per_sec',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_pkts_per_sec',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_pkts_per_sec',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.RATE,
  },
  {
    label: 'Flows/s',
    column: 'trautocount',
    unit: 'fps',
    options: [
      {
        value: 'avg_flows_per_sec',
        columnPrefixes: ['f_fumlat', 'f_fsumloc'],
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_flows_per_sec',
        columnPrefixes: ['f_fumlat', 'f_fsumloc'],
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_flows_per_sec',
        columnPrefixes: ['f_fumlat', 'f_fsumloc'],
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_flows_per_sec',
        columnPrefixes: ['f_fumlat', 'f_fsumloc'],
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.RATE,
  },
  {
    label: 'Unique IPs Source IPs Unique Count',
    column: 'f_hll(inet_src_addr,0.0001)',
    unit: 'unique_src_ip',
    options: [
      {
        value: 'avg_src_ip',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_ip',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_ip',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_ip',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique IPs Source IPs Bitrate Per IP',
    column: 'bytes_per_src_ip',
    unit: 'bytes_per_src_ip',
    options: [
      {
        value: 'avg_bytes_per_src_ip',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_bytes_per_src_ip',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_bytes_per_src_ip',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_bytes_per_src_ip',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique IPs Destination IPs Unique Count',
    column: 'f_hll(inet_dst_addr,0.0001)',
    unit: 'unique_dst_ip',
    options: [
      {
        value: 'avg_dst_ip',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_ip',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_ip',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_ip',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique IPs Destination IPs Bitrate Per IP',
    column: 'bytes_per_dst_ip',
    unit: 'bytes_per_dst_ip',
    options: [
      {
        value: 'avg_bytes_per_dst_ip',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_bytes_per_dst_ip',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_bytes_per_dst_ip',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_bytes_per_dst_ip',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Route Prefixes Source',
    column: 'f_hll(inet_src_route_prefix,0.0001)',
    unit: 'unique_src_route_prefix',
    options: [
      {
        value: 'avg_src_route_prefix',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_route_prefix',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_route_prefix',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_route_prefix',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Route Prefixes Destination',
    column: 'f_hll(inet_dst_route_prefix,0.0001)',
    unit: 'unique_dst_route_prefix',
    options: [
      {
        value: 'avg_dst_route_prefix',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_route_prefix',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_route_prefix',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_route_prefix',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Ports Source',
    column: 'f_hll(l4_src_port.agg0,0.0001)',
    unit: 'unique_src_port',
    options: [
      {
        value: 'avg_src_port',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_port',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_port',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_port',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Ports Destination',
    column: 'f_hll(l4_dst_port.agg0,0.0001)',
    unit: 'unique_dst_port',
    options: [
      {
        value: 'avg_dst_port',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_port',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_port',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_port',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique ASNs Source',
    column: 'f_hll(src_as.agg0,0.0001)',
    unit: 'unique_src_as',
    options: [
      {
        value: 'avg_src_as',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_as',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_as',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_as',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique ASNs Destination',
    column: 'f_hll(dst_as.agg0,0.0001)',
    unit: 'unique_dst_as',
    options: [
      {
        value: 'avg_dst_as',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_as',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_as',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_as',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique ASNs Next Hop Destination',
    column: 'f_hll(dst_nexthop_as.agg0,0.0001)',
    unit: 'unique_dst_nexthop_asn',
    options: [
      {
        value: 'avg_dst_nexthop_as',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_nexthop_as',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_nexthop_as',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_nexthop_as',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Countries Source',
    column: 'f_hll(src_geo.agg0,0.0001)',
    unit: 'unique_src_geo',
    options: [
      {
        value: 'avg_src_countries',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_countries',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_countries',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_countries',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Countries Destination',
    column: 'f_hll(dst_geo.agg0,0.0001)',
    unit: 'unique_dst_geo',
    options: [
      {
        value: 'avg_dst_countries',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_countries',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_countries',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_countries',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Regions Source',
    column: 'f_hll(src_geo_region.agg0,0.0001)',
    unit: 'unique_src_geo_region',
    options: [
      {
        value: 'avg_src_regions',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_regions',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_regions',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_regions',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Regions Destination',
    column: 'f_hll(dst_geo_region.agg0,0.0001)',
    unit: 'unique_dst_geo_region',
    options: [
      {
        value: 'avg_dst_regions',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_regions',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_regions',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_regions',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Cities Source',
    column: 'f_hll(src_geo_city.agg0,0.0001)',
    unit: 'unique_src_geo_city',
    options: [
      {
        value: 'avg_src_cities',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_src_cities',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_src_cities',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_src_cities',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Unique Cities Destination',
    column: 'f_hll(dst_geo_city.agg0,0.0001)',
    unit: 'unique_dst_geo_city',
    options: [
      {
        value: 'avg_dst_cities',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_dst_cities',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'p99th_dst_cities',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
      },
      {
        value: 'max_dst_cities',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Sample Rate Max',
    column: 'f_max_sample_rate',
    unit: 'max_sample_rate',
    options: [
      {
        value: 'avg_max_sample_rate',
        fn: 'average',
        label: 'Average',
        sample_rate: 0.01,
      },
      {
        value: 'p95th_max_sample_rate',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
        sample_rate: 0.01,
      },
      {
        value: 'p99th_max_sample_rate',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
        sample_rate: 0.01,
      },
      {
        value: 'max_max_sample_rate',
        fn: 'max',
        label: 'Max',
        sample_rate: 0.01,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Sample Rate Average',
    column: 'f_avg_sample_rate',
    unit: 'avg_sample_rate',
    options: [
      {
        value: 'avg_avg_sample_rate',
        fn: 'average',
        label: 'Average',
        sample_rate: 0.01,
      },
      {
        value: 'p95th_avg_sample_rate',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
        sample_rate: 0.01,
      },
      {
        value: 'p99th_avg_sample_rate',
        fn: 'percentile',
        rank: 99,
        label: '99th Percentile',
        sample_rate: 0.01,
      },
      {
        value: 'max_avg_sample_rate',
        fn: 'max',
        label: 'Max',
        sample_rate: 0.01,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Cisco Meraki Out Bytes',
    column: 'f_sum_int64_00',
    unit: 'ktsubtype__meraki__INT64_00',
    options: [
      {
        value: 'avg_ktsubtype__meraki__INT64_00',
        fn: 'average',
        label: 'Average',
        fix: 0,
      },
      {
        value: 'p95th_ktsubtype__meraki__INT64_00',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
        fix: 0,
      },
      {
        value: 'max_ktsubtype__meraki__INT64_00',
        fn: 'max',
        label: 'Max',
        fix: 0,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Cisco Meraki Out Packets',
    column: 'f_sum_int64_01',
    unit: 'ktsubtype__meraki__INT64_01',
    options: [
      {
        value: 'avg_ktsubtype__meraki__INT64_01',
        fn: 'average',
        label: 'Average',
        fix: 0,
      },
      {
        value: 'max_ktsubtype__meraki__INT64_01',
        fn: 'max',
        label: 'Max',
        fix: 0,
      },
      {
        value: 'p95th_ktsubtype__meraki__INT64_01',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
        fix: 0,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Silver Peak EdgeConnect Network To Server Delay',
    column: 'f_sum_int02',
    unit: 'ktsubtype__silverpeak__INT02',
    options: [
      {
        value: 'avg_ktsubtype__silverpeak__INT02',
        fn: 'average',
        label: 'Average',
        fix: 0,
      },
      {
        value: 'p95th_ktsubtype__silverpeak__INT02',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
        fix: 0,
      },
      {
        value: 'max_ktsubtype__silverpeak__INT02',
        fn: 'max',
        label: 'Max',
        fix: 0,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Silver Peak EdgeConnect Network To Client Delay',
    column: 'f_sum_int03',
    unit: 'ktsubtype__silverpeak__INT03',
    options: [
      {
        value: 'avg_ktsubtype__silverpeak__INT03',
        fn: 'average',
        label: 'Average',
        fix: 0,
      },
      {
        value: 'p95th_ktsubtype__silverpeak__INT03',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
        fix: 0,
      },
      {
        value: 'max_ktsubtype__silverpeak__INT03',
        fn: 'max',
        label: 'Max',
        fix: 0,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  {
    label: 'Silver Peak EdgeConnect Client To Server Response Delay',
    column: 'f_sum_int04',
    unit: 'ktsubtype__silverpeak__INT04',
    options: [
      {
        value: 'avg_ktsubtype__silverpeak__INT04',
        fn: 'average',
        label: 'Average',
        fix: 0,
      },
      {
        value: 'p95th_ktsubtype__silverpeak__INT04',
        fn: 'percentile',
        label: '95th Percentile',
        rank: 95,
        fix: 0,
      },
      {
        value: 'max_ktsubtype__silverpeak__INT04',
        fn: 'max',
        label: 'Max',
        fix: 0,
      },
    ],
    type: METRIC_TYPE.COUNTER,
  },
  // ── SNMP Device Metrics ──────────────────────────────────────────────────
  {
    label: 'SNMP Device CPU (%)',
    column: 'f_avg_int64_00',
    unit: 'ktappprotocol__snmp_device_metrics__INT64_00',
    options: [
      {
        value: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__snmp_device_metrics__INT64_00',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__snmp_device_metrics__INT64_00',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_DEVICE,
  },
  {
    label: 'SNMP Device Memory Utilization (%)',
    column: 'f_avg_int64_01',
    unit: 'ktappprotocol__snmp_device_metrics__INT64_01',
    options: [
      {
        value: 'avg_ktappprotocol__snmp_device_metrics__INT64_01',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__snmp_device_metrics__INT64_01',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__snmp_device_metrics__INT64_01',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_DEVICE,
  },
  {
    label: 'SNMP Device Uptime (s)',
    column: 'f_avg_int64_05',
    unit: 'ktappprotocol__snmp_device_metrics__INT64_05',
    options: [
      {
        value: 'avg_ktappprotocol__snmp_device_metrics__INT64_05',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'max_ktappprotocol__snmp_device_metrics__INT64_05',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_DEVICE,
  },
  // ── SNMP Interface Metrics ───────────────────────────────────────────────
  {
    label: 'SNMP Interface Inbound Traffic (bytes)',
    column: 'f_sum_int64_00',
    unit: 'ktappprotocol__snmp__INT64_00',
    options: [
      {
        value: 'avg_ktappprotocol__snmp__INT64_00',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__snmp__INT64_00',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__snmp__INT64_00',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_INTERFACE,
  },
  {
    label: 'SNMP Interface Outbound Traffic (bytes)',
    column: 'f_sum_int64_01',
    unit: 'ktappprotocol__snmp__INT64_01',
    options: [
      {
        value: 'avg_ktappprotocol__snmp__INT64_01',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__snmp__INT64_01',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__snmp__INT64_01',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_INTERFACE,
  },
  {
    label: 'SNMP Interface Inbound Errors',
    column: 'f_sum_int64_04',
    unit: 'ktappprotocol__snmp__INT64_04',
    options: [
      {
        value: 'avg_ktappprotocol__snmp__INT64_04',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'max_ktappprotocol__snmp__INT64_04',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_INTERFACE,
  },
  {
    label: 'SNMP Interface Outbound Errors',
    column: 'f_sum_int64_05',
    unit: 'ktappprotocol__snmp__INT64_05',
    options: [
      {
        value: 'avg_ktappprotocol__snmp__INT64_05',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'max_ktappprotocol__snmp__INT64_05',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.SNMP_INTERFACE,
  },
  // ── ST (Streaming Telemetry) Interface Metrics ───────────────────────────
  {
    label: 'ST Interface Inbound Traffic (bytes)',
    column: 'f_sum_int64_00',
    unit: 'ktappprotocol__st__INT64_00',
    options: [
      {
        value: 'avg_ktappprotocol__st__INT64_00',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__st__INT64_00',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__st__INT64_00',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.ST_INTERFACE,
  },
  {
    label: 'ST Interface Outbound Traffic (bytes)',
    column: 'f_sum_int64_01',
    unit: 'ktappprotocol__st__INT64_01',
    options: [
      {
        value: 'avg_ktappprotocol__st__INT64_01',
        fn: 'average',
        label: 'Average',
      },
      {
        value: 'p95th_ktappprotocol__st__INT64_01',
        fn: 'percentile',
        rank: 95,
        label: '95th Percentile',
      },
      {
        value: 'max_ktappprotocol__st__INT64_01',
        fn: 'max',
        label: 'Max',
      },
    ],
    type: METRIC_TYPE.COUNTER,
    compatibleCategory: DimensionCategory.ST_INTERFACE,
  },
];

export const allMetricOptions = flattenMetricOptions(metricNestedList);
