// GCP & GCP Cloud Run Dimensions
// This file is auto-merged into the full dimensionList by dimensions/index.ts
import { DimensionCategory } from '../metric_types';
import { dims } from './helpers';

export const dimensions = [
  ...dims(DimensionCategory.GCP, [
    // ── Source ──
    ['Source GCP Source Project ID', 'ktsubtype__gcp_subnet__STR00'],
    ['Source GCP Source VM Name', 'ktsubtype__gcp_subnet__STR02'],
    ['Source GCP Source Region', 'ktsubtype__gcp_subnet__STR04'],
    ['Source GCP Source Zone', 'ktsubtype__gcp_subnet__STR06'],
    ['Source GCP Source Subnet Name', 'ktsubtype__gcp_subnet__STR08'],
    ['Source GCP VPC Name', 'ktsubtype__gcp_subnet__STR11'],
    ['Source GCP GKE Pod Name', 'ktsubtype__gcp_subnet__STR13'],
    ['Source GCP GKE Pod Namespace', 'ktsubtype__gcp_subnet__STR15'],
    ['Source GCP GKE Cluster Name', 'ktsubtype__gcp_subnet__STR17'],
    ['Source GCP GKE Cluster Location', 'ktsubtype__gcp_subnet__STR19'],
    ['Source GCP GKE Service Name', 'ktsubtype__gcp_subnet__STR21'],
    ['Source GCP GKE Service Namespace', 'ktsubtype__gcp_subnet__STR23'],
    ['Source Entity Gateway Name', 'ktsubtype__gcp_subnet__STR27'],
    ['Source Entity Gateway Type', 'ktsubtype__gcp_subnet__STR29'],
    ['Source Firewall Rule Name', 'ktsubtype__gcp_subnet__STR31'],

    // ── Destination ──
    ['Destination GCP Destination Project ID', 'ktsubtype__gcp_subnet__STR01'],
    ['Destination GCP Destination VM Name', 'ktsubtype__gcp_subnet__STR03'],
    ['Destination GCP Destination Region', 'ktsubtype__gcp_subnet__STR05'],
    ['Destination GCP Destination Zone', 'ktsubtype__gcp_subnet__STR07'],
    ['Destination GCP Destination Subnet Name', 'ktsubtype__gcp_subnet__STR09'],
    ['Destination GCP VPC Name', 'ktsubtype__gcp_subnet__STR12'],
    ['Destination GCP GKE Pod Name', 'ktsubtype__gcp_subnet__STR14'],
    ['Destination GCP GKE Pod Namespace', 'ktsubtype__gcp_subnet__STR16'],
    ['Destination GCP GKE Cluster Name', 'ktsubtype__gcp_subnet__STR18'],
    ['Destination GCP GKE Cluster Location', 'ktsubtype__gcp_subnet__STR20'],
    ['Destination GCP GKE Service Name', 'ktsubtype__gcp_subnet__STR22'],
    ['Destination GCP GKE Service Namespace', 'ktsubtype__gcp_subnet__STR24'],
    ['Destination Entity Gateway Name', 'ktsubtype__gcp_subnet__STR28'],
    ['Destination Entity Gateway Type', 'ktsubtype__gcp_subnet__STR30'],
    ['Destination Firewall Rule Name', 'ktsubtype__gcp_subnet__STR32'],

    // ── Common ──
    ['GCP Reporter', 'ktsubtype__gcp_subnet__STR10'],
    ['GCP Dedicated Interconnect Name', 'ktsubtype__gcp_subnet__STR25'],
    ['GCP Dedicated Interconnect Type', 'ktsubtype__gcp_subnet__STR26'],
  ]),

  ...dims(DimensionCategory.GCP_CLOUD_RUN, [
    ['GCR Resource Type', 'ktsubtype__gcp_cloud_run__STR00'],
    ['GCR Service Name', 'ktsubtype__gcp_cloud_run__STR01'],
    ['GCR Location', 'ktsubtype__gcp_cloud_run__STR02'],
    ['GCR Service Revision Name', 'ktsubtype__gcp_cloud_run__STR03'],
    ['GCR Project ID', 'ktsubtype__gcp_cloud_run__STR04'],
    ['GCR HTTP Status Code', 'ktsubtype__gcp_cloud_run__INT00'],
  ]),
];
