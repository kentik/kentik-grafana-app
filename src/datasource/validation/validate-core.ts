/**
 * Shared validation logic used by:
 *   - src/datasource/tests/integration/validate-api.integration.test.ts (Jest integration tests)
 *
 * This module contains the pure logic for building queries, filtering dimensions by subtype,
 * and sending validation requests. It does NOT contain CLI argument parsing or console output.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type DimensionLike = { text: string; value: string; field: string; class?: string };

export type MetricLike = {
  value: string;
  column: string;
  fn: string;
  rank?: number;
  label: string;
  unit: string;
  group: string;
  origLabel: string;
  sample_rate: number;
  name: string;
};

export interface ValidationResult {
  type: 'dimension' | 'metric';
  name: string;
  value: string;
  status: 'pass' | 'fail' | 'error';
  httpStatus?: number;
  errorMessage?: string;
  durationMs: number;
}

export interface SubtypeResult {
  subtype: string;
  dimTotal: number;
  dimPass: number;
  dimFail: number;
  failures: ValidationResult[];
  passed: ValidationResult[];
}

export interface GoldenSnapshot {
  generatedAt: string;
  generatedBy: string;
  subtypes: Record<
    string,
    {
      validatedDimensions: string[];
      failedDimensions: string[];
    }
  >;
  allValidatedValues: string[];
}

// ── Subtype → dimension prefix mapping ─────────────────────────────────────

const STANDARD_FLOW_PREFIXES = [
  'ktsubtype__',
  'kt_aws_',
  'kt_az_',
  'kt_cloud_',
  'kt_k8s_',
  'ktappprotocol__snmp_',
  'ktappprotocol__st_',
  'ktappprotocol__event_snmp_traps',
  'ktappprotocol__event_deviceconf',
  'ktappprotocol__ktranslate_cisco_ras',
];

function isStandardFlowDim(value: string): boolean {
  return !STANDARD_FLOW_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export const SUBTYPE_DIM_PREFIXES: Record<string, string[]> = {
  router: [],
  'host-nprobe-dns-www': ['kflow_dns_', 'kflow_http_'],
  aws_subnet: ['ktsubtype__aws_subnet__', 'kt_aws_', 'kt_cloud_'],
  gcp_subnet: ['ktsubtype__gcp_subnet__', 'kt_cloud_'],
  gcp_cloud_run: ['ktsubtype__gcp_cloud_run__', 'kt_cloud_'],
  azure_subnet: ['ktsubtype__azure_subnet__', 'kt_az_', 'kt_cloud_', 'ktappprotocol__azure_'],
  oci_subnet: ['ktsubtype__oci_subnet__', 'kt_cloud_'],
  kprobe: ['kt_k8s_'],
  kappa: ['ktsubtype__kappa__', 'kt_k8s_'],
  paloalto: ['ktsubtype__paloalto__'],
  cisco_asa: ['ktsubtype__cisco_asa__'],
  cisco_asa_syslog: ['ktsubtype__cisco_asa_syslog__'],
  a10_thunder: ['ktsubtype__a10_thunder__'],
  juniper_pfe: ['ktsubtype__juniper_pfe__'],
  nokia_l2: ['ktsubtype__nokia_l2__'],
  cisco_nvzflow: ['ktsubtype__cisco_nvzflow__'],
  fortinet: ['ktsubtype__fortinet__'],
  velocloud: ['ktsubtype__velocloud__'],
  cisco_iosxe_sdwan: ['ktsubtype__cisco_iosxe_sdwan__'],
  silverpeak: ['ktsubtype__silverpeak__'],
  vxlan: ['ktsubtype__vxlan__', 'ktsubtype__sflow_tunnel_decode__'],
  sflow_tunnel_decode: ['ktsubtype__sflow_tunnel_decode__'],
  meraki: [],
  snmp_device_metrics: [
    'ktappprotocol__snmp_device_metrics__',
    'ktappprotocol__event_snmp_traps__',
    'ktappprotocol__event_deviceconf__',
    'ktappprotocol__ktranslate_cisco_ras__',
  ],
  snmp_interface_metrics: ['ktappprotocol__snmp__'],
  st_interface_metrics: ['ktappprotocol__st__'],
};

export const SUBTYPE_METRIC_OVERRIDE: Record<string, string> = {
  snmp_device_metrics: 'avg_ktappprotocol__snmp_device_metrics__INT64_00',
  snmp_interface_metrics: 'avg_ktappprotocol__snmp__INT64_00',
  st_interface_metrics: 'avg_ktappprotocol__st__INT64_00',
};

const SITE_DEVICE_DIMS = new Set(['i_device_site_name', 'i_device_id', 'i_site_market']);

export function getAllSubtypes(): string[] {
  return Object.keys(SUBTYPE_DIM_PREFIXES);
}

export function filterDimsForSubtype(dims: DimensionLike[], subtype: string): DimensionLike[] {
  const prefixes = SUBTYPE_DIM_PREFIXES[subtype];
  if (prefixes === undefined) {
    return dims;
  }

  const isSnmpSt = ['snmp_device_metrics', 'snmp_interface_metrics', 'st_interface_metrics'].includes(subtype);

  return dims.filter((d) => {
    if (isSnmpSt) {
      if (prefixes.some((p) => d.value.startsWith(p))) {
        return true;
      }
      if (SITE_DEVICE_DIMS.has(d.value)) {
        return true;
      }
      return false;
    }
    if (isStandardFlowDim(d.value)) {
      return true;
    }
    if (prefixes.some((p) => d.value.startsWith(p))) {
      return true;
    }
    return false;
  });
}

// ── Build a minimal query ──────────────────────────────────────────────────

export function buildMinimalQuery(dimension: string, metric: MetricLike, device: string | null): any {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600 * 1000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');

  const q: any = {
    dimension: [dimension],
    matrixBy: [],
    cidr: 32,
    cidr6: 128,
    topx: 1,
    depth: 75,
    fastData: 'Full',
    lookback_seconds: 3600,
    from_to_lookback: 3600,
    time_format: 'UTC',
    starting_time: fmt(oneHourAgo),
    ending_time: fmt(now),
    outsort: metric.value,
    aggregates: [
      {
        name: metric.value,
        column: metric.column,
        fn: metric.fn,
        sample_rate: metric.sample_rate || 1,
        raw: true,
        unit: metric.unit,
      },
    ],
    aggregateTypes: [metric.value],
    filters: { connector: 'All', filterGroups: [] },
    saved_filters: [],
    hostname_lookup: false,
    metric: [metric.unit || metric.value],
  };

  if (device) {
    q.device_name = [device];
  } else {
    q.all_devices = true;
    q.device_name = [];
  }

  return q;
}

// ── API call via Grafana proxy (with retry for 429 / transient errors) ─────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTopXDataQuery(
  grafanaUrl: string,
  datasourceUid: string,
  apiKey: string,
  query: any,
  maxRetries = 3
): Promise<{ ok: boolean; status: number; body: any }> {
  const url = `${grafanaUrl}/api/datasources/proxy/uid/${datasourceUid}/api/v5/query/topXdata`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const payload = {
    queries: [{ bucket: 'Left +Y Axis', isOverlay: false, query }],
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (attempt < maxRetries) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 30000);
        await sleep(backoff);
        continue;
      }
      throw err;
    }

    if ((resp.status === 429 || resp.status === 502) && attempt < maxRetries) {
      const retryAfter = resp.headers.get('retry-after');
      const backoff = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : resp.status === 429
        ? Math.min(5000 * Math.pow(2, attempt), 60000)
        : Math.min(2000 * Math.pow(2, attempt), 15000);
      await sleep(backoff);
      continue;
    }

    let body: any;
    try {
      body = await resp.json();
    } catch {
      body = { error: `Non-JSON response (status ${resp.status})` };
    }

    return { ok: resp.ok, status: resp.status, body };
  }

  return { ok: false, status: 0, body: { error: 'Max retries exceeded' } };
}

// ── Validate a single dimension ────────────────────────────────────────────

export async function validateDimension(
  dim: DimensionLike,
  metric: MetricLike,
  config: { grafanaUrl: string; datasourceUid: string; apiKey: string; device: string | null },
): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const query = buildMinimalQuery(dim.value, metric, config.device);
    const resp = await sendTopXDataQuery(config.grafanaUrl, config.datasourceUid, config.apiKey, query, 3);

    const durationMs = Date.now() - start;
    const status = resp.ok ? 'pass' : 'fail';
    const errorMessage = !resp.ok ? resp.body?.error || resp.body?.message || `HTTP ${resp.status}` : undefined;

    return {
      type: 'dimension',
      name: dim.text,
      value: dim.value,
      status,
      httpStatus: resp.status,
      errorMessage,
      durationMs,
    };
  } catch (err: any) {
    return {
      type: 'dimension',
      name: dim.text,
      value: dim.value,
      status: 'error',
      errorMessage: err.message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Validate all dimensions for a subtype ──────────────────────────────────

export async function validateSubtype(
  dims: DimensionLike[],
  allMetrics: MetricLike[],
  subtypeName: string,
  config: {
    grafanaUrl: string;
    datasourceUid: string;
    apiKey: string;
    device: string | null;
    delayMs: number;
  },
  onProgress?: (result: ValidationResult, index: number, total: number) => void
): Promise<SubtypeResult> {
  const filteredDims = filterDimsForSubtype(dims, subtypeName);

  // Resolve the correct metric for this subtype
  const overrideValue = SUBTYPE_METRIC_OVERRIDE[subtypeName];
  let metric: MetricLike;
  if (overrideValue) {
    const found = allMetrics.find((m) => m.value === overrideValue);
    metric = found || allMetrics.find((m) => m.value === 'avg_bits_per_sec')!;
  } else {
    metric = allMetrics.find((m) => m.value === 'avg_bits_per_sec')!;
  }

  const results: ValidationResult[] = [];

  for (let i = 0; i < filteredDims.length; i++) {
    const dim = filteredDims[i];
    const result = await validateDimension(dim, metric, config);
    results.push(result);

    if (onProgress) {
      onProgress(result, i, filteredDims.length);
    }

    if (i < filteredDims.length - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  return {
    subtype: subtypeName,
    dimTotal: filteredDims.length,
    dimPass: results.filter((r) => r.status === 'pass').length,
    dimFail: results.filter((r) => r.status !== 'pass').length,
    failures: results.filter((r) => r.status !== 'pass'),
    passed: results.filter((r) => r.status === 'pass'),
  };
}

// ── Snapshot I/O ───────────────────────────────────────────────────────────

export function buildGoldenSnapshot(
  subtypeResults: SubtypeResult[],
  generatedBy = 'validate-dimensions'
): GoldenSnapshot {
  const subtypes: GoldenSnapshot['subtypes'] = {};
  const allValidated = new Set<string>();

  for (const result of subtypeResults) {
    subtypes[result.subtype] = {
      validatedDimensions: result.passed.map((r) => r.value).sort(),
      failedDimensions: result.failures.map((r) => r.value).sort(),
    };
    for (const r of result.passed) {
      allValidated.add(r.value);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    generatedBy,
    subtypes,
    allValidatedValues: Array.from(allValidated).sort(),
  };
}
