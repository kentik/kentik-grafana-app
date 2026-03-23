// Interface & Network Classification Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { Dimension, DimensionClass, DimensionCategory } from '../metric_types';

export const dimensions: Dimension[] = [
  { text: 'Source Interface', value: 'InterfaceID_src', field: 'InterfaceID_src', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Source Interface Capacity', value: 'i_input_interface_speed', field: 'i_input_interface_speed', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Source VLAN', value: 'VLAN_src', field: 'VLAN_src', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Source MAC Address', value: 'src_eth_mac', field: 'src_eth_mac', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Destination Interface', value: 'InterfaceID_dst', field: 'InterfaceID_dst', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Destination Interface Capacity', value: 'i_output_interface_speed', field: 'i_output_interface_speed', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Destination VLAN', value: 'VLAN_dst', field: 'VLAN_dst', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Destination MAC Address', value: 'dst_eth_mac', field: 'dst_eth_mac', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Ultimate Exit Interface', value: 'bgp_ult_exit_interface', field: 'bgp_ult_exit_interface', class: DimensionClass.FLOW, category: DimensionCategory.INTERFACE },
  { text: 'Source Advanced sFlow Physical Interface', value: 'ktsubtype__advanced_sflow__INT00', field: 'ktsubtype__advanced_sflow__INT00', category: DimensionCategory.INTERFACE },
  { text: 'Destination Advanced sFlow Physical Interface', value: 'ktsubtype__advanced_sflow__INT01', field: 'ktsubtype__advanced_sflow__INT01', category: DimensionCategory.INTERFACE },
  { text: 'Advanced sFlow Vlan Rewrite Occurred', value: 'ktsubtype__advanced_sflow__INT02', field: 'ktsubtype__advanced_sflow__INT02', category: DimensionCategory.INTERFACE },
  { text: 'Advanced sFlow IP TTL', value: 'ktsubtype__advanced_sflow__INT03', field: 'ktsubtype__advanced_sflow__INT03', category: DimensionCategory.INTERFACE },
  { text: 'Advanced sFlow VLL VC ID', value: 'ktsubtype__advanced_sflow__INT04', field: 'ktsubtype__advanced_sflow__INT04', category: DimensionCategory.INTERFACE },
  { text: 'Source Connectivity Type', value: 'i_src_connect_type_name', field: 'i_src_connect_type_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Source Network Boundary', value: 'i_src_network_bndry_name', field: 'i_src_network_bndry_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Source Provider', value: 'i_src_provider_classification', field: 'i_src_provider_classification', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Source Traffic Origination', value: 'i_trf_origination', field: 'i_trf_origination', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Destination Connectivity Type', value: 'i_dst_connect_type_name', field: 'i_dst_connect_type_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Destination Network Boundary', value: 'i_dst_network_bndry_name', field: 'i_dst_network_bndry_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Destination Provider', value: 'i_dst_provider_classification', field: 'i_dst_provider_classification', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Destination Traffic Termination', value: 'i_trf_termination', field: 'i_trf_termination', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Ultimate Exit Connectivity Type', value: 'i_ult_exit_connect_type_name', field: 'i_ult_exit_connect_type_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Ultimate Exit Network Boundary', value: 'i_ult_exit_network_bndry_name', field: 'i_ult_exit_network_bndry_name', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Ultimate Exit Provider', value: 'i_ult_provider_classification', field: 'i_ult_provider_classification', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Simple Traffic Profile', value: 'simple_trf_prof', field: 'simple_trf_prof', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
  { text: 'Traffic Profile', value: 'i_trf_profile', field: 'i_trf_profile', class: DimensionClass.FLOW, category: DimensionCategory.NETWORK_CLASS },
];
