/**
 * Shared types and enums for dimension/metric definitions.
 *
 * This file exists to break circular dependencies: dimension category files
 * (dimensions/*.ts) and metric category files (metrics/*.ts) import types from
 * here, while metric_def.ts re-exports everything and adds the runtime helpers.
 *
 * DO NOT import from metric_def.ts or dimensions/ or metrics/ in this file.
 */

export type TransformFunction = (value: number, row: any, rangeSeconds: number) => number;

// ── Dimension class (FLOW vs SNMP/NMS vs Streaming Telemetry) ──────────────
export enum DimensionClass {
  FLOW = 'FLOW',
  SNMP = 'SNMP', // Telemetry/NMS
  ST = 'ST', // Streaming Telemetry
}

// ── Dimension category (matches Kentik KB structure) ───────────────────────
export enum DimensionCategory {
  GENERAL = 'General',
  INTERFACE = 'Interface',
  NETWORK_CLASS = 'Network Classification',
  SITE_DEVICE = 'Site & Device',
  ROUTING = 'Routing',
  GEO = 'Geography',
  CLOUD_COMMON = 'Cloud (Common)',
  AWS = 'AWS',
  GCP = 'GCP',
  GCP_CLOUD_RUN = 'GCP Cloud Run',
  AZURE = 'Azure',
  OCI = 'Oracle Cloud (OCI)',
  KUBERNETES = 'Kubernetes',
  KAPPA = 'Process-Aware Telemetry',
  DNS = 'DNS',
  HTTP = 'HTTP',
  OTT = 'OTT Services',
  PALO_ALTO = 'Palo Alto Networks',
  CISCO_ASA = 'Cisco ASA',
  CISCO_ASA_SYSLOG = 'Cisco ASA Syslog',
  A10_THUNDER = 'A10 Thunder',
  JUNIPER_PFE = 'Juniper PFE',
  NOKIA_L2 = 'Nokia Layer 2',
  CISCO_NVZFLOW = 'Cisco nvzFlow',
  FORTINET = 'Fortinet',
  VELOCLOUD = 'VMware SD-WAN',
  CISCO_IOSXE_SDWAN = 'Cisco IOS XE SD-WAN',
  SILVERPEAK = 'Silver Peak',
  VXLAN = 'VXLAN',
  MERAKI = 'Cisco Meraki',
  SNMP_DEVICE = 'SNMP Device Metrics',
  SNMP_INTERFACE = 'SNMP Interface Metrics',
  ST_INTERFACE = 'ST Interface Metrics',
}

// ── Metric category ────────────────────────────────────────────────────────
export enum MetricCategory {
  FLOW_RATE = 'Flow Rate',
  FLOW_ADVANCED = 'Flow Advanced',
  FLOW_UNIQUE = 'Flow Unique',
  FLOW_SAMPLE = 'Flow Sample Rate',
  MERAKI = 'Cisco Meraki',
  SILVERPEAK = 'Silver Peak',
  CISCO_SDWAN = 'Cisco SD-WAN',
  TCP_LATENCY = 'TCP Latency',
}

// ── Types ──────────────────────────────────────────────────────────────────
export type Dimension = {
  text: string;
  value: string;
  field: string;
  class?: DimensionClass;
  category?: DimensionCategory;
};

/**
 * The full, resolved shape of a metric option after flattenMetricOptions().
 * Individual option definitions in metricNestedList only need the fields
 * listed in MetricOptionInput — everything else is derived centrally.
 */
export type Metric = {
  value: string;
  column: string;
  fn: string;
  rank?: number;
  label: string;
  unit: string;
  group: string;
  origLabel: string;
  sample_rate: number;
  raw: boolean;
  name: string;
  tableField?: {
    text: string;
    field: string;
    metric: string;
  };
};

/**
 * The minimal input shape for a metric option inside metricNestedList.
 * Only fields that vary per-option need to be specified here;
 * flattenMetricOptions() injects the rest from the parent group or defaults.
 *
 * Required: value, fn, label
 * Optional: rank (for percentile), sample_rate (defaults to 1),
 *           column/unit (default from group), fix, tableField
 */
export type MetricOptionInput = {
  value: string;
  fn: string;
  label: string;
  rank?: number;
  /** Override group-level sample_rate (default: 1) */
  sample_rate?: number;
  /** Override group-level column (rare) */
  column?: string;
  /** Override group-level unit (rare) */
  unit?: string;
  /** Deprecated — present on some old definitions, ignored */
  fix?: number;
  tableField?: {
    text: string;
    field: string;
    metric: string;
  };
};

export type MetricGroup = {
  label: string;
  /** The KDE column shared by all options in this group (e.g. 'f_sum_both_bytes') */
  column: string;
  /** The wire-format metric unit shared by all options in this group (e.g. 'bytes') */
  unit: string;
  options: MetricOptionInput[];
  type?: METRIC_TYPE;
  metricCategory?: MetricCategory;
  /** When set, this metric group is only compatible with dimensions of this category */
  compatibleCategory?: DimensionCategory;
};

export type FilterField = { text: string; field: string; unequatable?: boolean };

export enum METRIC_TYPE {
  RATE = 'RATE',
  COUNTER = 'COUNTER',
}
