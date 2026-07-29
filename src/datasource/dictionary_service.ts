import { KentikAPI } from './kentik_api';

// ── Types matching the Dictionary API v20260604alpha1 proto ─────────────────

export enum MeasurementFamily {
  UNSPECIFIED = 0,
  TRAFFIC = 1,
  NMS = 2,
  NMS_INTERFACES = 3,
  SYNTHETICS = 4,
  BGP = 5,
  EVENTS = 6,
}

export interface DimensionField {
  key: string;
  label: string;
  data_type: string;
  category: string;
  column: string;
  direction: string;
  inverse: string;
  values: Record<string, string>;
  last_seen?: string;
  operator_set_key: string;
  filter_only: boolean;
  filter_column: string;
  query_column: string;
}

export interface MetricField {
  key: string;
  label: string;
  data_type: string;
  category: string;
  column: string;
  direction: string;
  inverse: string;
  values: Record<string, string>;
  last_seen?: string;
  window_fn: string;
  aggregate_fn: string;
  expression: string;
  depends_on: string[];
  to_bits: boolean;
  rollup: boolean;
  healthy_value: string;
  family_key: string;
  base_unit: string;
}

export interface MeasurementDetail {
  name: string;
  display_name: string;
  family: number;
  description: string;
  last_seen?: string;
  dimensions: DimensionField[];
  metrics: MetricField[];
}

export interface Operator {
  key: string;
  label: string;
}

export interface OperatorSet {
  key: string;
  operators: Operator[];
}

export interface MetricFamilyDef {
  key: string;
  label: string;
  quantity: number;
  base_unit: number;
  dual_axis_compatible: string[];
  incompatible_with: string[];
}

export interface DictionaryResponse {
  measurements: MeasurementDetail[];
  operator_sets: OperatorSet[];
  metric_families: MetricFamilyDef[];
}

// ── Dictionary Service ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Map the Dictionary API's string family enum to the numeric MeasurementFamily.
 * The gRPC-gateway serializes proto enums as their string names
 * (e.g. "MEASUREMENT_FAMILY_TRAFFIC").
 */
const FAMILY_ENUM_MAP: Record<string, MeasurementFamily> = {
  MEASUREMENT_FAMILY_UNSPECIFIED: MeasurementFamily.UNSPECIFIED,
  MEASUREMENT_FAMILY_TRAFFIC: MeasurementFamily.TRAFFIC,
  MEASUREMENT_FAMILY_NMS: MeasurementFamily.NMS,
  MEASUREMENT_FAMILY_NMS_INTERFACES: MeasurementFamily.NMS_INTERFACES,
  MEASUREMENT_FAMILY_SYNTHETICS: MeasurementFamily.SYNTHETICS,
  MEASUREMENT_FAMILY_BGP: MeasurementFamily.BGP,
  MEASUREMENT_FAMILY_EVENTS: MeasurementFamily.EVENTS,
};

function normalizeFamily(family: any): number {
  if (typeof family === 'number') {
    return family;
  }
  if (typeof family === 'string') {
    return FAMILY_ENUM_MAP[family] ?? MeasurementFamily.UNSPECIFIED;
  }
  return MeasurementFamily.UNSPECIFIED;
}

function normalizeDimension(d: any): DimensionField {
  return {
    key: d.key ?? '',
    label: d.label ?? '',
    data_type: d.dataType ?? d.data_type ?? '',
    category: d.category ?? '',
    column: d.column ?? '',
    direction: d.direction ?? '',
    inverse: d.inverse ?? '',
    values: d.values ?? {},
    last_seen: d.lastSeen ?? d.last_seen,
    operator_set_key: d.operatorSetKey ?? d.operator_set_key ?? '',
    filter_only: d.filterOnly ?? d.filter_only ?? false,
    filter_column: d.filterColumn ?? d.filter_column ?? '',
    query_column: d.queryColumn ?? d.query_column ?? '',
  };
}

function normalizeMetric(m: any): MetricField {
  return {
    key: m.key ?? '',
    label: m.label ?? '',
    data_type: m.dataType ?? m.data_type ?? '',
    category: m.category ?? '',
    column: m.column ?? '',
    direction: m.direction ?? '',
    inverse: m.inverse ?? '',
    values: m.values ?? {},
    last_seen: m.lastSeen ?? m.last_seen,
    window_fn: m.windowFn ?? m.window_fn ?? '',
    aggregate_fn: m.aggregateFn ?? m.aggregate_fn ?? '',
    expression: m.expression ?? '',
    depends_on: m.dependsOn ?? m.depends_on ?? [],
    to_bits: m.toBits ?? m.to_bits ?? false,
    rollup: m.rollup ?? false,
    healthy_value: m.healthyValue ?? m.healthy_value ?? '',
    family_key: m.familyKey ?? m.family_key ?? '',
    base_unit: m.baseUnit ?? m.base_unit ?? '',
  };
}

function normalizeMeasurement(m: any): MeasurementDetail {
  return {
    name: m.name ?? '',
    display_name: m.displayName ?? m.display_name ?? m.name ?? '',
    family: normalizeFamily(m.family),
    description: m.description ?? '',
    last_seen: m.lastSeen ?? m.last_seen,
    dimensions: Array.isArray(m.dimensions) ? m.dimensions.map(normalizeDimension) : [],
    metrics: Array.isArray(m.metrics) ? m.metrics.map(normalizeMetric) : [],
  };
}

function normalizeOperatorSet(o: any): OperatorSet {
  return {
    key: o.key ?? '',
    operators: Array.isArray(o.operators)
      ? o.operators.map((op: any) => ({ key: op.key ?? '', label: op.label ?? '' }))
      : [],
  };
}

function normalizeMetricFamily(f: any): MetricFamilyDef {
  return {
    key: f.key ?? '',
    label: f.label ?? '',
    quantity: f.quantity ?? 0,
    base_unit: f.baseUnit ?? f.base_unit ?? 0,
    dual_axis_compatible: f.dualAxisCompatible ?? f.dual_axis_compatible ?? [],
    incompatible_with: f.incompatibleWith ?? f.incompatible_with ?? [],
  };
}

/**
 * Normalize a raw Dictionary API response (camelCase, string enums) into the
 * documented snake_case DictionaryResponse shape used throughout the plugin.
 */
export function normalizeDictionaryResponse(data: any): DictionaryResponse {
  const measurements = Array.isArray(data?.measurements) ? data.measurements : [];
  const operatorSets = Array.isArray(data?.operatorSets)
    ? data.operatorSets
    : Array.isArray(data?.operator_sets)
      ? data.operator_sets
      : [];
  const metricFamilies = Array.isArray(data?.metricFamilies)
    ? data.metricFamilies
    : Array.isArray(data?.metric_families)
      ? data.metric_families
      : [];

  return {
    measurements: measurements.map(normalizeMeasurement),
    operator_sets: operatorSets.map(normalizeOperatorSet),
    metric_families: metricFamilies.map(normalizeMetricFamily),
  };
}

export class DictionaryService {
  private cache: DictionaryResponse | null = null;
  private cacheTimestamp = 0;
  private fetchPromise: Promise<DictionaryResponse> | null = null;

  constructor(private api: KentikAPI) {}

  /** Get the full dictionary, using cache if fresh. */
  async getDictionary(): Promise<DictionaryResponse> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cache;
    }

    // Deduplicate concurrent fetches
    if (!this.fetchPromise) {
      this.fetchPromise = this.api.getDictionary().then((data: any) => {
        const result = normalizeDictionaryResponse(data);
        this.cache = result;
        this.cacheTimestamp = Date.now();
        this.fetchPromise = null;
        return result;
      }).catch((err) => {
        this.fetchPromise = null;
        throw err;
      });
    }

    return this.fetchPromise;
  }

  /** Get all measurements. */
  async getMeasurements(): Promise<MeasurementDetail[]> {
    const dict = await this.getDictionary();
    return dict.measurements;
  }

  /** Get a specific measurement by name. */
  async getMeasurement(name: string): Promise<MeasurementDetail | undefined> {
    const measurements = await this.getMeasurements();
    return measurements.find((m) => m.name === name);
  }

  /** Get measurements filtered by family. */
  async getMeasurementsByFamily(family: MeasurementFamily): Promise<MeasurementDetail[]> {
    const measurements = await this.getMeasurements();
    return measurements.filter((m) => m.family === family);
  }

  /** Get dimensions for a specific measurement. */
  async getDimensions(measurementName: string): Promise<DimensionField[]> {
    const measurement = await this.getMeasurement(measurementName);
    return measurement?.dimensions || [];
  }

  /** Get metrics for a specific measurement. */
  async getMetrics(measurementName: string): Promise<MetricField[]> {
    const measurement = await this.getMeasurement(measurementName);
    return measurement?.metrics || [];
  }

  /** Get operator sets. */
  async getOperatorSets(): Promise<OperatorSet[]> {
    const dict = await this.getDictionary();
    return dict.operator_sets;
  }

  /** Get metric family definitions. */
  async getMetricFamilies(): Promise<MetricFamilyDef[]> {
    const dict = await this.getDictionary();
    return dict.metric_families;
  }

  /** Invalidate the cache (e.g. after config change). */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}
