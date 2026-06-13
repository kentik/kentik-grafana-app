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
        const result: DictionaryResponse = {
          measurements: Array.isArray(data?.measurements) ? data.measurements : [],
          operator_sets: Array.isArray(data?.operator_sets) ? data.operator_sets : [],
          metric_families: Array.isArray(data?.metric_families) ? data.metric_families : [],
        };
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
