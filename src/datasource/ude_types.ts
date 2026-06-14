/**
 * UDE Query Editor types
 *
 * Extends the Grafana DataQuery with UDE-specific fields, providing a clean
 * separation from the legacy TopXData query path.
 */
import { DataQuery } from '@grafana/schema';
import { VizType, QueryFilterGroup } from './ude_query_builder';

export const UDE_QUERY_TYPE = 'ude' as const;

/** Discriminated query model for UDE queries stored by Grafana panels. */
export interface UDEQueryTarget extends DataQuery {
  queryType: typeof UDE_QUERY_TYPE;
  measurement: string;
  dimensions: string[];
  metrics: string[];
  aliasBy?: string;
  prefix?: string;
  filterGroups: QueryFilterGroup[];
  filterConnector: string;
  vizType: VizType;
  limit: number;
  windowSize?: number;
  rollups?: Array<{ metric: string; fn: string }>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  cidr?: number;
  cidr6?: number;
}

export const DEFAULT_UDE_QUERY: Omit<UDEQueryTarget, 'refId'> = {
  queryType: UDE_QUERY_TYPE,
  measurement: '',
  dimensions: [],
  metrics: [],
  aliasBy: '',
  prefix: '',
  filterGroups: [],
  filterConnector: 'All',
  vizType: VizType.LINE,
  limit: 8,
};

/** Type guard to detect UDE queries vs legacy queries. */
export function isUDEQuery(query: DataQuery): query is UDEQueryTarget {
  return (query as any).queryType === UDE_QUERY_TYPE;
}
