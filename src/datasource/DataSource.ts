/**
 * Kentik DataSource — backend datasource (v3, UDE-only)
 *
 * Query execution, result parsing, and credential handling now live in the Go
 * backend (see pkg/plugin). This frontend class extends DataSourceWithBackend,
 * which routes `query()` and `testDatasource()` to the backend QueryData and
 * CheckHealth handlers respectively.
 *
 * The query/config editor still run in the frontend. They obtain dictionary
 * metadata through the backend `dictionary` resource (CallResource), exposed
 * here via getDictionaryService().
 */
import { DictionaryService } from './dictionary_service';
import { UDEQueryTarget } from './ude_types';
import { resolveVariableQuery } from './variable_query';
import { DataSourceInstanceSettings, ScopedVars, MetricFindValue } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { MyDataSourceOptions } from '../types';

export class DataSource extends DataSourceWithBackend<UDEQueryTarget, MyDataSourceOptions> {
  private dictionaryService: DictionaryService;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);

    // The dictionary is served by the backend `dictionary` resource. The
    // DictionaryService only needs an object exposing getDictionary(), so we
    // adapt getResource() into that shape and reuse the existing caching and
    // camelCase normalization logic.
    this.dictionaryService = new DictionaryService({
      getDictionary: () => this.getResource('dictionary'),
    } as any);
  }

  /** Expose for UDE editor components. */
  getDictionaryService(): DictionaryService {
    return this.dictionaryService;
  }

  /**
   * Interpolate Grafana dashboard/template variables into the query before it
   * is sent to the backend.
   *
   * The query model (measurement, metrics, dimensions, rollups, sort) is
   * interpolated here so dashboards can drive the query with template variables
   * (e.g. `$metric`, `$breakout`). Per-series alias tokens left in aliasBy /
   * prefix ($tag_*, {{...}}, $col, $metric) are resolved later in the backend
   * against each row's dimensions.
   */
  applyTemplateVariables(query: UDEQueryTarget, scopedVars: ScopedVars): UDEQueryTarget {
    const templateSrv = getTemplateSrv();
    // Query-affecting fields must use the variable's VALUE (default format), not
    // its display text — e.g. a `dimensions(/traffic)` variable has text "IP/CIDR"
    // but value "inet_src_addr"; only the value is a valid query field.
    const replaceValue = (v?: string) => (v ? templateSrv.replace(v, scopedVars) : v);
    const replaceList = (list?: string[]) =>
      Array.isArray(list) ? list.map((v) => templateSrv.replace(v, scopedVars)) : list;

    // Interpolate variables inside filter values (e.g. filter_value "$device").
    // A filter is treated as "no constraint" and dropped when its interpolated
    // value is empty, is the explicit all-selector sentinel ("__ALL__"), or is
    // still an unresolved "$var" (e.g. a template variable whose values() lookup
    // returned nothing). This ensures an "All"/unset variable never filters
    // every row out and leaves a dashboard blank.
    const isNoOpFilterValue = (v: string) => v === '' || v === '__ALL__' || v.startsWith('$');
    const replaceFilterGroups = (groups?: any[]): any[] | undefined => {
      if (!Array.isArray(groups)) {
        return groups;
      }
      return groups
        .map((g) => {
          const filters = (g.filters || [])
            .map((f: any) => ({ ...f, filter_value: templateSrv.replace(String(f.filter_value ?? ''), scopedVars) }))
            .filter((f: any) => !isNoOpFilterValue(f.filter_value));
          return { ...g, filters };
        })
        .filter(
          (g) =>
            (g.filters || []).length > 0 || (g.filter_groups || []).length > 0 || (g.saved_filters || []).length > 0
        );
    };

    return {
      ...query,
      measurement: replaceValue(query.measurement) ?? query.measurement,
      metrics: replaceList(query.metrics) ?? query.metrics,
      dimensions: replaceList(query.dimensions) ?? query.dimensions,
      filterGroups: replaceFilterGroups(query.filterGroups) ?? query.filterGroups,
      rollups: query.rollups
        ? query.rollups.map((r) => ({ ...r, metric: templateSrv.replace(r.metric, scopedVars) }))
        : query.rollups,
      sortBy: replaceValue(query.sortBy),
      aliasBy: replaceValue(query.aliasBy),
      prefix: replaceValue(query.prefix),
    };
  }

  /** Skip queries the backend cannot run, avoiding empty round-trips.
   *  Legacy v2 queries (dimension/metric without measurement) are always
   *  allowed through — the backend shim handles them. */
  filterQuery(query: UDEQueryTarget): boolean {
    if (query.hide) {
      return false;
    }
    // Legacy v2 targets have "dimension"/"metric" but no "measurement".
    const raw = query as any;
    if ((raw.dimension || raw.metric) && !query.measurement) {
      return true; // let the backend shim handle it
    }
    return Boolean(query.measurement) && (query.metrics || []).length > 0;
  }

  // ── Dashboard Template Variables (dictionary-based) ────────────────────────

  /**
   * Resolve a dashboard "Query" variable. Supported functions:
   *   measurements()
   *   metrics(<measurement>)
   *   dimensions(<measurement>)
   *   dimension_values(<measurement>, <dimension>)   (dictionary-enumerated)
   *   values(<measurement>, <dimension>)             (live distinct values)
   * Arguments may reference other dashboard variables.
   */
  async metricFindQuery(query: string, options?: { scopedVars?: ScopedVars }): Promise<MetricFindValue[]> {
    const interpolated = getTemplateSrv().replace(query, options?.scopedVars, 'text');

    // values(<measurement>, <dimension>) queries the backend for the live
    // distinct values of a dimension (e.g. device_name), which the dictionary
    // does not enumerate.
    const liveMatch = /^\s*values\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)\s*$/.exec(interpolated);
    if (liveMatch) {
      const [, measurement, dimension] = liveMatch;
      const params = new URLSearchParams({ measurement, dimension });
      const values: string[] = await this.getResource(`distinct?${params.toString()}`);
      return (values || []).map((v) => ({ text: v, value: v }));
    }

    const dict = await this.dictionaryService.getDictionary();
    return resolveVariableQuery(interpolated, dict);
  }

  // ── Ad-hoc Variable Support (dictionary-based) ─────────────────────────────

  async getTagKeys(): Promise<MetricFindValue[]> {
    const dict = await this.dictionaryService.getDictionary();
    const keys = new Map<string, string>();
    for (const m of dict.measurements) {
      for (const d of m.dimensions) {
        if (!d.filter_only && !keys.has(d.key)) {
          keys.set(d.key, d.label || d.key);
        }
      }
    }
    return Array.from(keys.entries()).map(([value, text]) => ({ text, value }));
  }

  async getTagValues(options: { key: string }): Promise<MetricFindValue[]> {
    const dict = await this.dictionaryService.getDictionary();
    for (const m of dict.measurements) {
      const dim = m.dimensions.find((d) => d.key === options.key);
      if (dim && dim.values && Object.keys(dim.values).length > 0) {
        return Object.entries(dim.values).map(([value, text]) => ({ text: text || value, value }));
      }
    }
    return [];
  }
}
