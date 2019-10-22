export type TransformFunction = (value: number, row: any, rangeSeconds: number) => number;
export type Metric = { text: string; value: string; field: string };
export type Unit = {
  text: string;
  value: string;
  field: string;
  outsort: string;
  gfUnit: string;
  gfAxisLabel: string;
  transform?: TransformFunction;
  tableFields: Array<{ text: string; field: string; unit: string; transform?: TransformFunction }>;
};
export type FilterField = { text: string; field: string };

export const metricList: Metric[] = [
  { text: 'Traffic', value: 'Traffic', field: 'traffic' },
  { text: 'TopFlow', value: 'TopFlow', field: 'TopFlow' },
  { text: 'Top flow IP', value: 'TopFlowsIP', field: 'TopFlowsIP' },
  { text: 'Source Country', value: 'Geography_src', field: 'src_geo' },
  { text: 'Source Geo Region', value: 'src_geo_region', field: 'src_geo_region' },
  { text: 'Source Geo City', value: 'src_geo_city', field: 'src_geo_city' },
  { text: 'Source As Number', value: 'AS_src', field: 'src_as' },
  { text: 'Source Interface', value: 'InterfaceID_src', field: 'input_port' },
  { text: 'Source Port', value: 'Port_src', field: 'l4_src_port' },
  { text: 'Source VLAN', value: 'VLAN_src', field: 'vlan_in' },
  { text: 'Source IP/CIDR', value: 'IP_src', field: 'ipv4_src_addr' },
  { text: 'Source MAC Address', value: 'src_eth_mac', field: 'src_eth_mac' },
  { text: 'Source Route Prefix/LEN', value: 'src_route_prefix_len', field: 'src_route_prefix_len' },
  { text: 'Source Route LEN', value: 'src_route_length', field: 'src_route_length' },
  { text: 'Source BGP Community', value: 'src_bgp_community', field: 'src_bgp_community' },
  { text: 'Source BGP AS_Path', value: 'src_bgp_aspath', field: 'src_bgp_aspath' },
  { text: 'Source BGP Next Hop IP/CIDR', value: 'src_nexthop_ip', field: 'ipv4_src_next_hop' },
  { text: 'Source Next Hop AS Number', value: 'src_nexthop_asn', field: 'src_nexthop_as' },
  { text: 'Source 2nd BGP_HOP AS Number', value: 'src_second_asn', field: 'src_second_asn' },
  { text: 'Source 3nd BGP_HOP AS Number', value: 'src_third_asn', field: 'src_third_asn' },
  { text: 'Source Protocol:IP Port', value: 'src_proto_port', field: 'src_proto_port' },
  { text: 'Destination Country', value: 'Geography_dst', field: 'dst_geo' },
  { text: 'Destination Region', value: 'dst_geo_region', field: 'dst_geo_region' },
  { text: 'Destination City', value: 'dst_geo_city', field: 'dst_geo_city' },
  { text: 'Destination As Number', value: 'AS_dst', field: 'dst_as' },
  { text: 'Destination Interface', value: 'InterfaceID_dst', field: 'output_port' },
  { text: 'Destination Port', value: 'Port_dst', field: 'l4_dst_port' },
  { text: 'Destination VLAN', value: 'VLAN_dst', field: 'vlan_out' },
  { text: 'Destination IP/CIDR', value: 'IP_dst', field: 'ipv4_dst_addr' },
  { text: 'Destination MAC Address', value: 'dst_eth_mac', field: 'dst_eth_mac' },
  { text: 'Destination Route Prefix/LEN', value: 'dst_route_prefix_len', field: 'dst_route_prefix_len' },
  { text: 'Destination Route LEN', value: 'dst_route_length', field: 'dst_route_length' },
  { text: 'Destination BGP Community', value: 'dst_bgp_community', field: 'dst_bgp_community' },
  { text: 'Destination BGP AS_Path', value: 'dst_bgp_aspath', field: 'dst_bgp_aspath' },
  { text: 'Destination BGP Next Hop IP/CIDR', value: 'dst_nexthop_ip', field: 'ipv4_dst_next_hop' },
  { text: 'Destination Next Hop AS Number', value: 'dst_nexthop_asn', field: 'dst_nexthop_as' },
  { text: 'Destination 2nd BGP_HOP AS Number', value: 'dst_second_asn', field: 'dst_second_asn' },
  { text: 'Destination 3nd BGP_HOP AS Number', value: 'dst_third_asn', field: 'dst_third_asn' },
  { text: 'Destination Protocol:IP Port', value: 'dst_proto_port', field: 'dst_proto_port' },
  { text: 'Full Device', value: 'i_device_id', field: 'i_device_id' },
  { text: 'Full Site', value: 'i_device_site_name', field: 'i_device_site_name' },
  { text: 'Full Protocol', value: 'Proto', field: 'protocl' },
  { text: 'Full INET Family', value: 'inet_family', field: 'inet_family' },
  { text: 'Full TOS', value: 'TOS', field: 'tos' },
  { text: 'Full TCP flags', value: 'tcp_flags', field: 'tcp_flags' },
  { text: 'AS Top Talkers', value: 'ASTopTalkers', field: 'ASTopTalkers' },
  { text: 'Interface Top Talkers', value: 'InterfaceTopTalkers', field: 'InterfaceTopTalkers' },
  { text: 'Port to Port Talkers', value: 'PortPortTalkers', field: 'PortPortTalkers' },
  { text: 'Region Top Talkers', value: 'RegionTopTalkers', field: 'RegionTopTalkers' },
];

function toBitsPerSecond(value: number, row: any): number {
  return (value * 8) / row.i_duration;
}

function toPerSecondRate(value: number, row: any): number {
  return value / row.i_duration;
}

function totalToAvgPerSecond(value: number, row: any, rangeSeconds: number): number {
  return value / rangeSeconds;
}

function totalToBitsPerSecond(value: number, row: any, rangeSeconds: number): number {
  return (value * 8) / rangeSeconds;
}

export const unitList: Unit[] = [
  {
    text: 'Bits/s',
    value: 'bytes',
    field: 'f_sum_both_bytes',
    outsort: 'avg_both',
    gfUnit: 'bps',
    gfAxisLabel: 'Bits/s',
    transform: toBitsPerSecond,
    tableFields: [
      { text: 'Avg', field: 'avg_both', unit: 'bps', transform: totalToBitsPerSecond },
      { text: '95th Percentile', field: 'p95th_both', unit: 'bps' },
      { text: 'Max', field: 'max_both', unit: 'bps' },
    ],
  },
  {
    text: 'Packets/s',
    value: 'packets',
    field: 'f_sum_both_pkts',
    outsort: 'avg_both',
    gfUnit: 'pps',
    gfAxisLabel: 'Packets/s',
    transform: toPerSecondRate,
    tableFields: [
      { text: 'Avg', field: 'avg_both', unit: 'pps', transform: totalToAvgPerSecond },
      { text: '95th Percentile', field: 'p95th_both', unit: 'pps' },
      { text: 'Max', field: 'max_both', unit: 'pps' },
    ],
  },
  {
    text: 'Unique Src IPs',
    value: 'unique_src_ip',
    field: 'f_hll(inet_src_addr,0.0001)',
    outsort: 'avg_ips',
    gfUnit: 'short',
    gfAxisLabel: 'Unique Src IPs',
    tableFields: [
      { text: 'Average', field: 'avg_ips', unit: 'none' },
      { text: 'p95th', field: 'p95th_ips', unit: 'none' },
      { text: 'Max', field: 'max_ips', unit: 'none' },
      { text: 'p95th mbps', field: 'p95th_bits_per_sec', unit: 'bps' },
      { text: 'p95th pps', field: 'p95th_pkts_per_sec', unit: 'pps' },
    ],
  },
  {
    text: 'Unique Dst IPs',
    value: 'unique_dst_ip',
    field: 'f_hll(inet_dst_addr,0.0001)',
    outsort: 'avg_ips',
    gfUnit: 'short',
    gfAxisLabel: 'Unique Dst IPs',
    tableFields: [
      { text: 'Average', field: 'avg_ips', unit: 'none' },
      { text: 'p95th', field: 'p95th_ips', unit: 'none' },
      { text: 'Max', field: 'max_ips', unit: 'none' },
      { text: 'p95th mbps', field: 'p95th_bits_per_sec', unit: 'bps' },
      { text: 'p95th pps', field: 'p95th_pkts_per_sec', unit: 'pps' },
    ],
  },
];

export const filterFieldList: FilterField[] = [
  { text: 'Source City', field: 'src_geo_city' },
  { text: 'Source Region', field: 'src_geo_region' },
  { text: 'Source Country', field: 'src_geo' },
  { text: 'Source AS Number', field: 'src_as' },
  { text: 'Source AS Name', field: 'src_as_name' },
  { text: 'Source Flow Tag', field: 'src_flow_tags' },
  { text: 'Source IP Port', field: 'l4_src_port' },
  { text: 'Source MAC Address', field: 'src_eth_mac' },
  { text: 'Source VLAN', field: 'vlan_in' },
  { text: 'Source IP Address', field: 'inet_src_addr' },
  { text: 'Source Interface ID', field: 'input_port' },
  { text: 'Source Interface Name', field: 'i_input_interface_description' },
  { text: 'Source Interface Description', field: 'i_input_snmp_alias' },
  { text: 'Source Route Prefix', field: 'ipv4_src_route_prefix' },
  { text: 'Source Route LEN', field: 'src_route_length' },
  { text: 'Source BGP AS_PATH', field: 'src_bgp_aspath' },
  { text: 'Source BGP Community', field: 'src_bgp_community' },
  { text: 'Source Next Hop IP/CIDR', field: 'ipv4_src_next_hop' },
  { text: 'Source Next Hop AS Number', field: 'src_nexthop_as' },
  { text: 'Source Next Hop AS Name', field: 'src_nexthop_as_name' },
  { text: 'Source 2nd BGP_HOP AS Number', field: 'src_second_asn' },
  { text: 'Source 2nd BGP_HOP AS Name', field: 'src_second_asn_name' },
  { text: 'Source 3nd BGP_HOP AS Number', field: 'src_third_asn' },
  { text: 'Source 3nd BGP_HOP AS Name', field: 'src_third_asn_name' },
  { text: 'Destination City', field: 'dst_geo_city' },
  { text: 'Destination Region', field: 'dst_geo_region' },
  { text: 'Destination Country', field: 'dst_geo' },
  { text: 'Destination AS Number', field: 'dst_as' },
  { text: 'Destination AS Name', field: 'dst_as_name' },
  { text: 'Destination Flow Tag', field: 'dst_flow_tags' },
  { text: 'Destination IP Port', field: 'l4_dst_port' },
  { text: 'Destination MAC Address', field: 'dst_eth_mac' },
  { text: 'Destination VLAN', field: 'vlan_out' },
  { text: 'Destination IP Address', field: 'inet_dst_addr' },
  { text: 'Destination Interface ID', field: 'output_port' },
  { text: 'Destination Interface Name', field: 'i_output_interface_description' },
  { text: 'Destination Interface Description', field: 'i_output_snmp_alias' },
  { text: 'Destination Route Prefix', field: 'ipv4_dst_route_prefix' },
  { text: 'Destination Route LEN', field: 'dst_route_length' },
  { text: 'Destination BGP AS_PATH', field: 'dst_bgp_aspath' },
  { text: 'Destination BGP Community', field: 'dst_bgp_community' },
  { text: 'Destination Next Hop IP/CIDR', field: 'ipv4_dst_next_hop' },
  { text: 'Destination Next Hop AS Number', field: 'dst_nexthop_as' },
  { text: 'Destination Next Hop AS Name', field: 'dst_nexthop_as_name' },
  { text: 'Destination 2nd BGP_HOP AS Number', field: 'dst_second_asn' },
  { text: 'Destination 2nd BGP_HOP AS Name', field: 'dst_second_asn_name' },
  { text: 'Destination 3nd BGP_HOP AS Number', field: 'dst_third_asn' },
  { text: 'Destination 3nd BGP_HOP AS Name', field: 'dst_third_asn_name' },
  { text: 'TCP Flags', field: 'tcp_flags' },
  { text: 'TCP Flags (raw)', field: 'tcp_flags_raw' },
  { text: 'Protocol', field: 'protocol' },
  // {text: 'Protocol Name', field: 'i_protocol_name'},
  { text: 'INET Family', field: 'inet_family' },
  { text: 'Device Name', field: 'i_device_name' },
  { text: 'TCP Retransmits', field: 'tcp_retransmit' },
  { text: 'TOS/Diffserv', field: 'tos' },
  { text: 'Per-flow packets (both in and out)', field: 'both_pkts' },
  { text: 'Per-flow packets (recorded inbound)', field: 'in_pkts' },
  { text: 'Per-flow bytes (recorded inbound)', field: 'in_bytes' },
  { text: 'Per-flow packets (recorded outbound)', field: 'out_pkts' },
  { text: 'Per-flow bytes (recorded outbound)', field: 'out_bytes' },
];
