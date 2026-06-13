/**
 * UDE Query Builder
 *
 * Constructs ExecuteQueryRequest payloads for the Kentik Query API (v20251204alpha1)
 * from the Grafana query model. This replaces the legacy query_builder.ts for
 * the new query path.
 */

// ── Query API Types (matching the proto) ───────────────────────────────────

export enum WindowFunction {
  UNSPECIFIED = 0,
  SUM = 1,
  AVG = 2,
  MIN = 3,
  MAX = 4,
  LAST = 5,
  RATE = 6,
  KT_HLL_CARDINALITY = 7,
  DELTA = 8,
  NONE = 9,
}

export enum AggregateFunction {
  UNSPECIFIED = 0,
  SUM = 1,
  AVG = 2,
  MIN = 3,
  MAX = 4,
  LAST = 5,
  KT_HLL_CARDINALITY = 6,
  NONE = 7,
}

export enum VizType {
  UNSPECIFIED = 0,
  STACKED_AREA = 1,
  STACKED_AREA_HUNDRED_PERCENT = 2,
  LINE = 3,
  STACKED_BAR = 4,
  HORIZON = 5,
  BAR = 6,
  PIE = 7,
  SANKEY = 8,
  SUNBURST = 9,
  MATRIX = 10,
  GAUGE = 11,
  TABLE = 12,
  GEO_HEAT_MAP = 13,
}

export enum MetricType {
  UNSPECIFIED = 0,
  COUNTER = 1,
  GAUGE = 2,
  STRING = 3,
  HISTOGRAM = 4,
  EXPRESSION = 5,
}

export interface QueryDimension {
  name: string;
  cidr?: number;
  cidr6?: number;
  cut?: { regex: string; selector: string };
  hostname_lookup?: boolean;
}

export interface QueryMetric {
  name: string;
  type?: MetricType;
}

export interface QueryFilter {
  filter_field: string;
  operator: string;
  filter_value: string;
  right_filter_field?: string;
}

export interface QueryFilterGroup {
  connector: string; // "All" or "Any"
  name?: string;
  not: boolean;
  filters: QueryFilter[];
  filter_groups?: QueryFilterGroup[];
  saved_filters?: string[];
}

export interface QueryFilters {
  connector: string;
  filter_groups: QueryFilterGroup[];
}

export interface QueryTimeRange {
  lookback: number; // seconds, takes precedence if > 0
  start: number; // epoch seconds
  end: number; // epoch seconds
}

export interface QueryWindow {
  size: number; // seconds
  fn?: Record<string, WindowFunction>;
}

export interface QueryRollup {
  metric: string;
  fn: string; // 'sum', 'avg', 'p99', etc.
}

export interface QuerySort {
  rollup: string;
  order?: 'asc' | 'desc';
}

export interface QueryViz {
  type: VizType;
  limit: number;
}

export interface UDEQuery {
  measurement: string;
  dimensions: QueryDimension[];
  metrics: QueryMetric[];
  filters?: { sources?: QueryFilters; dimensions?: QueryFilters };
  time: QueryTimeRange;
  window?: QueryWindow;
  rollups?: QueryRollup[];
  sort?: QuerySort[];
  viz: QueryViz;
  limit?: number;
}

export interface ExecuteQueryRequest {
  query: UDEQuery;
  application_metadata: {
    name: string;
    context?: string;
    data?: Record<string, any>;
  };
  request_id: string;
}

// ── Grafana Query Model ────────────────────────────────────────────────────

/** The query model stored by Grafana for each panel target. */
export interface GrafanaUDEQuery {
  measurement: string;
  dimensions: string[];
  metrics: string[];
  filterGroups?: QueryFilterGroup[];
  filterConnector?: string;
  timeRange: { from: number; to: number }; // epoch ms from Grafana
  windowSize?: number; // seconds
  rollups?: Array<{ metric: string; fn: string }>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  vizType?: VizType;
  limit?: number;
  cidr?: number;
  cidr6?: number;
}

// ── Builder ────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Build an ExecuteQueryRequest from a Grafana panel query model.
 */
export function buildExecuteQueryRequest(query: GrafanaUDEQuery): ExecuteQueryRequest {
  const dimensions: QueryDimension[] = query.dimensions.map((name) => ({
    name,
    ...(query.cidr ? { cidr: query.cidr } : {}),
    ...(query.cidr6 ? { cidr6: query.cidr6 } : {}),
  }));

  const metrics: QueryMetric[] = query.metrics.map((name) => ({ name }));

  const time: QueryTimeRange = {
    lookback: 0,
    start: Math.floor(query.timeRange.from / 1000),
    end: Math.floor(query.timeRange.to / 1000),
  };

  const viz: QueryViz = {
    type: query.vizType || VizType.LINE,
    limit: query.limit || 8,
  };

  const udeQuery: UDEQuery = {
    measurement: query.measurement,
    dimensions,
    metrics,
    time,
    viz,
  };

  // Filters
  if (query.filterGroups && query.filterGroups.length > 0) {
    udeQuery.filters = {
      dimensions: {
        connector: query.filterConnector || 'All',
        filter_groups: query.filterGroups,
      },
    };
  }

  // Window
  if (query.windowSize && query.windowSize > 0) {
    udeQuery.window = { size: query.windowSize };
  }

  // Rollups
  if (query.rollups && query.rollups.length > 0) {
    udeQuery.rollups = query.rollups;
  }

  // Sort
  if (query.sortBy) {
    udeQuery.sort = [{ rollup: query.sortBy, order: query.sortOrder || 'desc' }];
  }

  // Limit
  if (query.limit) {
    udeQuery.limit = query.limit;
  }

  return {
    query: udeQuery,
    application_metadata: {
      name: 'kentik-grafana-plugin',
      context: 'panel-query',
    },
    request_id: generateRequestId(),
  };
}
