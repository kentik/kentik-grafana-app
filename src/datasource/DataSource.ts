/**
 * Kentik DataSource — v3 (UDE-only)
 *
 * Uses the Dictionary API for metadata and the Query API for execution.
 * No legacy TopXData/v5 path remains.
 */
import { KentikAPI } from './kentik_api';
import { DictionaryService } from './dictionary_service';
import { UDEQueryTarget, DEFAULT_UDE_QUERY } from './ude_types';
import { buildExecuteQueryRequest, GrafanaUDEQuery } from './ude_query_builder';
import {
  DataSourceInstanceSettings,
  DataSourceApi,
  FieldType,
  DataQueryRequest,
  DataQueryResponse,
  TestDataSourceResponse,
  PartialDataFrame,
  MetricFindValue,
} from '@grafana/data';
import { getTemplateSrv, TemplateSrv, getBackendSrv } from '@grafana/runtime';
import { MyDataSourceOptions } from '../types';
import { Observable } from 'rxjs';
import * as _ from 'lodash';

export class DataSource extends DataSourceApi<UDEQueryTarget, MyDataSourceOptions> {
  private kentikApi: KentikAPI;
  private dictionaryService: DictionaryService;
  private templateSrv: TemplateSrv;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);

    const kentikApi = new KentikAPI(
      getBackendSrv(),
      instanceSettings.uid,
      instanceSettings.url,
      undefined,
      instanceSettings.jsonData?.email,
      ''
    );
    this.kentikApi = kentikApi;
    this.dictionaryService = new DictionaryService(kentikApi);
    this.templateSrv = getTemplateSrv();
  }

  /** Expose for UDE editor components. */
  getDictionaryService(): DictionaryService {
    return this.dictionaryService;
  }

  // ── Query Execution ────────────────────────────────────────────────────────

  query(options: DataQueryRequest<UDEQueryTarget>): Observable<DataQueryResponse> {
    return new Observable<DataQueryResponse>((subscriber) => {
      this.executeUDEQueries(options).then(
        (response) => {
          subscriber.next(response);
          subscriber.complete();
        },
        (err) => {
          subscriber.error(err);
        }
      );
    });
  }

  private async executeUDEQueries(options: DataQueryRequest<UDEQueryTarget>): Promise<DataQueryResponse> {
    const targets = (options.targets || []).filter((t) => !t.hide && t.measurement && (t.metrics || []).length > 0);
    if (targets.length === 0) {
      return { data: [] };
    }

    const frames: PartialDataFrame[] = [];

    for (const target of targets) {
      const dims = this.normalizeStringList(target.dimensions);
      const mets = this.normalizeStringList(target.metrics);

      const derivedWindow = Math.max(60, Math.round((options.intervalMs || 60000) / 1000));
      const windowSize = target.windowSize && target.windowSize > 0 ? target.windowSize : derivedWindow;

      const grafanaQuery: GrafanaUDEQuery = {
        measurement: target.measurement,
        dimensions: dims,
        metrics: mets,
        filterGroups: target.filterGroups || [],
        filterConnector: target.filterConnector || 'All',
        timeRange: {
          from: options.range.from.valueOf(),
          to: options.range.to.valueOf(),
        },
        vizType: target.vizType,
        limit: target.limit,
        windowSize,
        rollups: target.rollups,
        sortBy: target.sortBy,
        sortOrder: target.sortOrder,
        cidr: target.cidr,
        cidr6: target.cidr6,
      };

      const request = buildExecuteQueryRequest(grafanaQuery);

      try {
        const response = await this.kentikApi.executeQuery(request);
        const parsed = this.parseResults(response, { ...DEFAULT_UDE_QUERY, ...target, dimensions: dims, metrics: mets } as UDEQueryTarget, options.scopedVars);
        frames.push(...parsed);
      } catch (err: any) {
        const upstream =
          err?.data?.message ||
          err?.data?.error ||
          (typeof err?.data === 'string' ? err.data : undefined) ||
          err?.statusText ||
          err?.message ||
          'Unknown error';
        throw new Error(`UDE query failed for ${target.measurement}: ${upstream}`);
      }
    }

    return { data: frames };
  }

  // ── Result Parsing ─────────────────────────────────────────────────────────

  private parseResults(response: any, target: UDEQueryTarget, scopedVars?: Record<string, any>): PartialDataFrame[] {
    const results = response?.results;
    if (!results) {
      return [];
    }

    const timestamps: number[] = (Array.isArray(results.timestamps) ? results.timestamps : []).map(
      (t: number | string) => Number(t) * 1000
    );
    const rows = Array.isArray(results.rows) ? results.rows : [];

    if (timestamps.length === 0 && rows.length === 0) {
      return [];
    }

    const frames: PartialDataFrame[] = [];

    if (timestamps.length > 0) {
      for (const row of rows) {
        const dimensionLabel = this.buildSeriesLabel(row.dimensions || {}, target);
        const values = row.values || {};

        for (const [metricName, metricValues] of Object.entries(values)) {
          const metricLabel = String(metricName);
          const fallback = dimensionLabel ? `${dimensionLabel} - ${metricLabel}` : metricLabel;

          let seriesName = fallback;
          if (target.aliasBy || target.prefix) {
            try {
              seriesName = this.applyAlias(row.dimensions || {}, metricLabel, target, scopedVars) || fallback;
            } catch {
              seriesName = fallback;
            }
          }

          const numericValues = this.coerceValues(metricValues, timestamps.length);
          frames.push({
            fields: [
              { name: 'time', type: FieldType.time, values: timestamps },
              { name: seriesName, type: FieldType.number, values: numericValues },
            ],
          });
        }
      }
    } else {
      const dimensionKeys = target.dimensions || [];
      const metricKeys = target.metrics || [];
      const dimColumns = dimensionKeys.map((k) => ({ name: k, type: FieldType.string, values: [] as string[] }));
      const metricColumns = metricKeys.map((k) => ({ name: k, type: FieldType.number, values: [] as number[] }));

      for (const row of rows) {
        const dims = row.dimensions || {};
        const rollups = row.rollups || {};
        for (let i = 0; i < dimensionKeys.length; i++) {
          dimColumns[i].values.push(dims[dimensionKeys[i]] || '');
        }
        for (let i = 0; i < metricKeys.length; i++) {
          const raw = rollups[metricKeys[i]];
          metricColumns[i].values.push(raw == null ? 0 : Number(raw));
        }
      }
      frames.push({ fields: [...dimColumns, ...metricColumns] });
    }

    return frames;
  }

  // ── Alias Resolution (dictionary-based) ────────────────────────────────────

  private applyAlias(
    dimensions: Record<string, string>,
    metricName: string,
    target: UDEQueryTarget,
    scopedVars?: Record<string, any>
  ): string {
    const aliasBy = this.templateSrv.replace(target.aliasBy || '', scopedVars, 'text');
    const prefix = this.templateSrv.replace(target.prefix || '', scopedVars, 'text');

    const replaceTag = (match: string, tagName: string): string => {
      // Try direct dimension value match
      if (dimensions[tagName] !== undefined) {
        return dimensions[tagName];
      }
      // Case-insensitive fallback
      const key = Object.keys(dimensions).find((k) => k.toLowerCase() === tagName.toLowerCase());
      if (key) {
        return dimensions[key];
      }
      return match;
    };

    let result = '';
    if (!aliasBy) {
      const dimLabel = this.buildSeriesLabel(dimensions, target);
      const suffix = metricName ? ` (${metricName})` : '';
      result = prefix ? `${prefix} ${dimLabel}${suffix}` : `${dimLabel}${suffix}`;
    } else {
      result = prefix ? `${prefix} ${aliasBy}` : aliasBy;
    }

    result = result.replace(/\$tag_([a-zA-Z0-9_.]+)/g, replaceTag);
    result = result.replace(/\{\{([a-zA-Z0-9_.\s-]+)\}\}/g, replaceTag);
    result = result.replace(/\$col/g, metricName);
    result = result.replace(/\$metric_group/g, metricName);
    result = result.replace(/\$metric/g, metricName);

    return this.templateSrv.replace(result, scopedVars, 'text');
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

  // ── Test Connection ────────────────────────────────────────────────────────

  async testDatasource(): Promise<TestDataSourceResponse> {
    this.dictionaryService.invalidateCache();

    try {
      const dict = await this.dictionaryService.getDictionary();
      const count = dict.measurements?.length || 0;
      if (count === 0) {
        return { status: 'error', message: 'Connected but no measurements found.' };
      }
      return { status: 'success', message: `Connected to Kentik successfully. ${count} measurements available.` };
    } catch (err: any) {
      if (err?.status === 400 && err?.data === 'Authentication to data source failed') {
        return { status: 'error', message: 'Kentik rejected the configured email or API token.' };
      }
      return { status: 'error', message: err?.message || 'Failed to connect to Kentik API.' };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildSeriesLabel(dimensions: Record<string, string>, target: UDEQueryTarget): string {
    const parts: string[] = [];
    for (const key of target.dimensions || []) {
      if (dimensions[key]) {
        parts.push(dimensions[key]);
      }
    }
    return parts.join(', ');
  }

  private coerceValues(raw: any, length: number): number[] {
    if (Array.isArray(raw)) {
      return raw.map((v) => Number(v));
    }
    if (raw && Array.isArray(raw.values)) {
      return raw.values.map((v: any) => Number(v));
    }
    if (raw == null) {
      return [];
    }
    return new Array(length).fill(Number(raw));
  }

  private normalizeStringList(value: any): string[] {
    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'string' ? v : v?.name || v?.value || ''))
        .filter((v) => v.length > 0);
    }
    if (typeof value === 'string' && value.length > 0) {
      return [value];
    }
    return [];
  }
}
