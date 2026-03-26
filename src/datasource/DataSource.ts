import queryBuilder from './query_builder';
import {
  dimensionList,
  metricNestedList,
  filterFieldList,
  Dimension,
  Metric,
  FilterField,
  allMetricOptions,
} from './metric_def';
import { KentikAPI } from './kentik_api';
import { KentikProxy } from './kentik_proxy';
import {
  DataSourceInstanceSettings,
  DataSourceJsonData,
  DataSourceApi,
  AdHocVariableFilter,
  FieldType,
  DataQueryRequest,
  DataQueryResponse,
  TestDataSourceResponse,
  PartialDataFrame,
} from '@grafana/data';
import { getTemplateSrv, TemplateSrv, getBackendSrv } from '@grafana/runtime';
import { showAlert } from '../utils/alert_helper';

import * as _ from 'lodash';
import { Observable } from 'rxjs';
import { CustomFilter, DEFAULT_QUERY, Query } from './QueryEditor';

export interface MyDataSourceOptions extends DataSourceJsonData {}
export const ALL_SITES_LABEL = 'All';
export const ALL_DEVICES_LABEL = 'All';
export const KENTIK_DESCRIPTION_PANEL = 'kentik-description-panel';

/**
 * Extract Kentik field names referenced in alias/prefix patterns.
 *
 * Scans for `{{tagName}}` and `$tag_tagName` patterns and resolves each
 * tagName to a valid Kentik API dimension via the dimensionList (matching
 * text, value, or field).  Only dimensions that exist in dimensionList are
 * returned — filter-only fields (e.g. i_device_name) are skipped because
 * the Kentik TopXData API rejects them as invalid dimension values.
 *
 * Returns deduplicated dimension `value` strings suitable for injection
 * into the query `dimension` array.
 */
function extractAliasDimensions(aliasBy: string | undefined, prefix: string | undefined): string[] {
  const dims = new Set<string>();
  const patterns = [
    /\{\{([a-zA-Z0-9_.\s-]+)\}\}/g,
    /\$tag_([a-zA-Z0-9_.]+)/g,
  ];

  for (const text of [aliasBy || '', prefix || '']) {
    for (const regex of patterns) {
      let m;
      while ((m = regex.exec(text)) !== null) {
        const tagName = m[1].trim();
        // Skip built-in tokens and Grafana variables
        if (tagName === 'col' || tagName === 'metric' || tagName === 'metric_group' || tagName.startsWith('$') || tagName.startsWith('__')) {
          continue;
        }
        // Only resolve through dimensionList — these are the values the
        // Kentik TopXData API actually accepts as dimensions.
        const dim = dimensionList.find(
          (d) =>
            d.text.toLowerCase() === tagName.toLowerCase() ||
            d.value.toLowerCase() === tagName.toLowerCase() ||
            d.field.toLowerCase() === tagName.toLowerCase()
        );
        if (dim) {
          dims.add(dim.value);
        }
        // If not found in dimensionList, skip — it's either a filter-only
        // field or will be resolved at runtime from series row properties.
      }
    }
  }
  return Array.from(dims);
}

/**
 * Extract the raw tag names referenced in alias/prefix patterns.
 * Returns the literal strings inside `{{...}}` and `$tag_...` tokens
 * (e.g. "device", "site", "IP_src") without resolving them.
 */
function extractAliasTagNames(aliasBy: string | undefined, prefix: string | undefined): string[] {
  const tags = new Set<string>();
  const patterns = [
    /\{\{([a-zA-Z0-9_.\s-]+)\}\}/g,
    /\$tag_([a-zA-Z0-9_.]+)/g,
  ];
  for (const text of [aliasBy || '', prefix || '']) {
    for (const regex of patterns) {
      let m;
      while ((m = regex.exec(text)) !== null) {
        const tagName = m[1].trim();
        if (tagName !== 'col' && tagName !== 'metric' && tagName !== 'metric_group' && !tagName.startsWith('$') && !tagName.startsWith('__')) {
          tags.add(tagName);
        }
      }
    }
  }
  return Array.from(tags);
}

/**
 * Derive the Kentik portal URL from the datasource region configuration.
 *
 * - `default`  → https://portal.kentik.com
 * - `eu`       → https://portal.kentik.eu
 * - `custom`   → Derive from the custom API URL:
 *     - `https://api.acme.com`      → `https://portal.acme.com`
 *     - `https://grpc.api.acme.com` → `https://portal.acme.com`
 *     - `https://kentik.internal`   → `https://kentik.internal` (no api. prefix)
 */
export function derivePortalUrl(region: string, dynamicUrl?: string, url?: { v5?: string; v6?: string }): string {
  switch (region) {
    case 'eu':
      return 'https://portal.kentik.eu';
    case 'custom': {
      // Use the dynamicUrl (user-entered) or fall back to the v5 API URL
      const apiUrl = dynamicUrl || url?.v5 || '';
      if (!apiUrl) {
        return 'https://portal.kentik.com';
      }
      try {
        const parsed = new URL(apiUrl);
        // Strip `api.` or `grpc.api.` prefix and replace with `portal.`
        const host = parsed.hostname;
        if (host.startsWith('grpc.api.')) {
          parsed.hostname = 'portal.' + host.slice('grpc.api.'.length);
        } else if (host.startsWith('api.')) {
          parsed.hostname = 'portal.' + host.slice('api.'.length);
        }
        // Return origin only (no path)
        return parsed.origin;
      } catch {
        return 'https://portal.kentik.com';
      }
    }
    default:
      return 'https://portal.kentik.com';
  }
}

export class DataSource extends DataSourceApi<Query, MyDataSourceOptions> {
  datasourceType: string;
  kentik: any;
  templateSrv: TemplateSrv;
  initialRun: boolean;
  /** Kentik portal base URL — derived from the configured region. */
  portalUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.datasourceType = instanceSettings.type;
    this.initialRun = true;

    // `arguments[1]` is a hack used by `datasource.test.ts`
    const kentikApi = new KentikAPI(arguments[1] || getBackendSrv(), instanceSettings.uid);
    this.kentik = new KentikProxy(kentikApi, instanceSettings.uid);
    this.templateSrv = getTemplateSrv();

    // Derive the Kentik portal URL from the region setting.
    // On-prem / custom deployments: derive portal from the configured API URL
    // by stripping the `api.` or `grpc.api.` prefix.  If the URL doesn't match
    // the hosted pattern, use it as-is (on-prem portals are often at the same origin).
    const jsonData = instanceSettings.jsonData as any;
    const region = jsonData?.region || 'default';
    this.portalUrl = derivePortalUrl(region, jsonData?.dynamicUrl, jsonData?.url);
  }

  interpolateDeviceField(value: any, variable: any) {
    // if no multi or include all do not regexEscape
    if (!variable.multi && !variable.includeAll) {
      return value;
    }

    if (typeof value === 'string') {
      return value;
    }

    return value.join(',');
  }

  private getMultiSelectValues(value: any) {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((s: any) => {
          return s.value !== undefined ? s.value : s;
        })
        .join(',');
    }
    return '';
  }

  private isQueryTargetEmpty = (target: any): boolean => {
    // 'sites' and 'devices' are not strictly required for query execution (they default to All), so
    // removing them avoids blocking initial load if empty.
    const targetObligatoryItems = ['dimension', 'metric'];

    const isTargetEmpty = targetObligatoryItems.some((item) => {
      const targetItem = target[item];

      if (targetItem === null || targetItem === undefined) {
        return true;
      }

      return Array.isArray(targetItem) && targetItem.length === 0;
    });

    return isTargetEmpty;
  };

  private isQueryTargetsEmpty = (options: DataQueryRequest<Query>): boolean => {
    const { targets } = options;

    if (!targets || targets.length === 0) {
      return true;
    }

    const areTargetsEmpty = targets.every((target) => this.isQueryTargetEmpty(target));

    return areTargetsEmpty;
  };

  query(options: DataQueryRequest<Query>): Observable<DataQueryResponse> {
    return new Observable<DataQueryResponse>((subscriber) => {
      this._executeQuery(options).then(
        (result) => {
          subscriber.next(result.response);
          subscriber.complete();
        },
        (err) => {
          subscriber.error(err);
        }
      );
    });
  }

  /** Internal query execution — returns DataFrames. */
  private async _executeQuery(options: DataQueryRequest<Query>): Promise<{ response: DataQueryResponse }> {
    if (this.initialRun === true && this.isQueryTargetsEmpty(options)) {
      this.initialRun = false;
      return { response: { data: [] } };
    }

    this.initialRun = false;

    if (!options.targets || options.targets.length === 0) {
      return { response: { data: [] } };
    }
    if (options.panelPluginId === KENTIK_DESCRIPTION_PANEL) {
      return { response: { data: [] } };
    }

    const customDimensions = await this.kentik.getCustomDimensions().catch((err: any) => {
      showAlert(err);
      return [];
    });
    const savedFiltersList = await this.kentik.getSavedFilters().catch((err: any) => {
      showAlert(err);
      return [];
    });
    const kentikFilters: AdHocVariableFilter[] = options.filters || [];

    const promises = _.map(
      _.filter(options.targets, (target) => !target.hide),
      async (target, i) => {
        try {
        _.defaults(target, DEFAULT_QUERY);

        const siteNames = this.templateSrv.replace(
          this.getMultiSelectValues(target.sites),
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );

        const deviceNames = this.templateSrv.replace(
          this.getMultiSelectValues(target.devices),
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );

        const dimensionsNames = this.templateSrv.replace(
          this.getMultiSelectValues(target.dimension),
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );

        const metricsNames = this.templateSrv.replace(
          this.getMultiSelectValues(target.metric),
          options.scopedVars,
          this.interpolateDeviceField.bind(this)
        );

        const queryCustomFilters = _.map(
          _.filter(
            target.customFilters,
            (filter: CustomFilter) => filter.keySegment !== null && filter.valueSegment !== null
          ),
          (filter: CustomFilter) => {
            return {
              condition: this.templateSrv.replace(filter.conjunctionOperator, options.scopedVars),
              key: this.templateSrv.replace(filter.keySegment || undefined, options.scopedVars),
              operator: this.templateSrv.replace(filter.operatorSegment, options.scopedVars),
              value: this.templateSrv.replace(filter.valueSegment || undefined, options.scopedVars),
            };
          }
        );
        const kentikFilterGroups = queryBuilder.convertToKentikFilterGroup(
          kentikFilters,
          customDimensions,
          savedFiltersList
        );
        const queryCustomFilterGroups = queryBuilder.convertToKentikFilterGroup(
          queryCustomFilters,
          customDimensions,
          savedFiltersList
        );
        const filters = [...kentikFilterGroups.kentikFilters, ...queryCustomFilterGroups.kentikFilters];

        const queryOptions = {
          deviceNames: deviceNames,
          range: {
            from: options.range.from,
            to: options.range.to,
          },
          dimension: dimensionsNames,
          metric: metricsNames,
          kentikFilterGroups: filters,
          kentikSavedFilters: kentikFilterGroups.savedFilters,
          hostnameLookup: this.templateSrv.replace(target.hostnameLookup),
          siteNames: siteNames,
          topx: target.topx,
        };

        let query = queryBuilder.buildTopXdataQuery(queryOptions, options.panelPluginId);

        // Inject alias-referenced dimensions into the query so the Kentik API
        // returns them on each response row.  e.g. if alias is "{{device}}"
        // and the user is querying by IP_src, we add i_device_id to the
        // dimension array so the response includes it.
        //
        // For SNMP/ST queries (ktappprotocol__ dimensions) we inject the
        // protocol-table equivalent instead, e.g. for {{device}} we inject
        // ktappprotocol__snmp_device_metrics__i_device_name (same protocol
        // prefix as the existing dimensions).
        const existingDims: string[] = Array.isArray(query.dimension) ? query.dimension : [query.dimension];
        const protocolTableDim = existingDims.find(
          (d: string) => typeof d === 'string' && d.startsWith('ktappprotocol__')
        );

        if (protocolTableDim) {
          // Extract the protocol prefix: e.g. "ktappprotocol__snmp_device_metrics__"
          // from "ktappprotocol__snmp_device_metrics__i_device_site_name"
          const lastSep = protocolTableDim.lastIndexOf('__');
          const protocolPrefix = lastSep > 0 ? protocolTableDim.slice(0, lastSep + 2) : null;

          if (protocolPrefix) {
            // Map friendly alias tags to the SNMP suffix equivalents
            const snmpAliasMap: Record<string, string> = {
              'device': 'i_device_name',
              'i_device_id': 'i_device_name',
              'site': 'i_device_site_name',
              'i_device_site_name': 'i_device_site_name',
            };

            const aliasTags = extractAliasTagNames(target.aliasBy, target.prefix);
            for (const tagName of aliasTags) {
              // Resolve friendly name → flow field via dimensionList
              const dim = dimensionList.find(
                (d) =>
                  d.text.toLowerCase() === tagName.toLowerCase() ||
                  d.value.toLowerCase() === tagName.toLowerCase() ||
                  d.field.toLowerCase() === tagName.toLowerCase()
              );
              const effectiveName = dim ? dim.value : tagName;
              const snmpSuffix = snmpAliasMap[tagName.toLowerCase()] || snmpAliasMap[effectiveName.toLowerCase()];

              if (snmpSuffix) {
                const snmpDim = protocolPrefix + snmpSuffix;
                // Verify it's a valid dimension before injecting
                if (dimensionList.some((d) => d.value === snmpDim) && !query.dimension.includes(snmpDim)) {
                  query.dimension.push(snmpDim);
                }
              }
            }
          }
        } else {
          // Flow query: inject standard flow dimensions
          const aliasDims = extractAliasDimensions(target.aliasBy, target.prefix);
          for (const dim of aliasDims) {
            if (!query.dimension.includes(dim)) {
              query.dimension.push(dim);
            }
          }
        }

        // Fetch the Kentik Data Explorer drilldown URL in parallel with data queries.
        // This returns a hash-based URL (e.g. /v4/core/explorer/<hash>) that preserves
        // the full query context when the user clicks "Open in Kentik".
        const drilldownPromise = this.kentik.invokeDrilldownUrlQuery(query)
          .then((response: any) => {
            const url = typeof response === 'string' ? response
              : response?.url || response?.data?.url || response;
            if (url && typeof url === 'string' && url.includes('/')) {
              return url;
            }
            return `${this.portalUrl}/v4/core/explorer`;
          })
          .catch(() => `${this.portalUrl}/v4/core/explorer`);

        // table mode
        if (target.mode === 'table') {
          const [topXData, drilldownUrl] = await Promise.all([
            this.kentik.invokeTopXDataQuery(query),
            drilldownPromise,
          ]);
          const processed = await this.processResponse(
            query,
            target.mode,
            { ...target, scopedVars: options.scopedVars },
            topXData.data,
            drilldownUrl
          );

          return processed;
        }

        // graph mode — fire drilldown URL + all aggregate queries in parallel
        const aggPromises = query.aggregates.map(async (singleAgg: any) => {
          const perAggQuery = {
            ...query,
            aggregates: [singleAgg],
            aggregateTypes: [singleAgg.name],
            outsort: singleAgg.name,
          };

          const topXData = await this.kentik.invokeTopXDataQuery(perAggQuery);
          const drilldownUrl = await drilldownPromise;
          return this.processResponse(
            perAggQuery,
            target.mode,
            { ...target, aggregate: singleAgg, scopedVars: options.scopedVars },
            topXData.data,
            drilldownUrl
          );
        });

        const allAggResults = await Promise.all(aggPromises);
        return _.flatten(allAggResults);
        } catch (err: any) {
          throw err;
        }
      }
    );

    const results = await Promise.all(promises);
    return { response: { data: _.flatten(results) } };
  }

  async processResponse(query: any, mode: string, target: any, data: any, drilldownUrl: string) {
    if (!data?.results || !data.results[0]) {
      return [];
    }

    const bucketData = data.results[0].data;
    if (!bucketData || bucketData.length === 0) {
      return [];
    }

    const extendedDimensionsList = await this._getExtendedDimensionList(dimensionList);
    const dimensionDefs = _.filter(extendedDimensionsList, (item) => query.dimension?.includes(item.value));

    if (_.isEmpty(dimensionDefs)) {
      throw new Error('Query error: Dimension field is required');
    }

    const metricDefs = allMetricOptions.filter((opt) => query.aggregateTypes?.includes(opt.value));

    if (!metricDefs) {
      throw new Error('Query error: Metric field is required');
    }

    if (mode === 'table') {
      return this.processTableData(bucketData, dimensionDefs, metricDefs);
    } else {
      return this.processTimeSeries(bucketData, query, target, drilldownUrl);
    }
  }

  processTimeSeries(bucketData: any, query: any, target: any, drilldownUrl: string) {
    const frames: PartialDataFrame[] = [];

    // drilldownUrl is now the full Kentik Data Explorer URL with query hash
    // (e.g. https://portal.kentik.com/v4/core/explorer/ce2e3a75ab7a...)
    const explorerUrl = drilldownUrl || '';

    // Frame-level notice: surfaces as an always-visible link in the panel
    const frameMeta = explorerUrl ? {
      custom: { kentikExplorerUrl: explorerUrl },
    } : undefined;

    let endIndex = query.topx;
    if (bucketData.length < endIndex) {
      endIndex = bucketData.length;
    }

    for (let i = 0; i < endIndex; i++) {
      const series = bucketData[i];

      const timeseries = _.find(series.timeSeries, (serie) => {
        return serie.flow && serie.flow.length;
      });

      const seriesName = this.applyAliasPattern(series, query, target);

      if (timeseries) {
        const frame: PartialDataFrame = {
          meta: frameMeta,
          fields: [
            {
              name: 'time',
              type: FieldType.time,
              values: _.map(timeseries.flow, (p) => p[0]),
            },
            {
              name: seriesName,
              type: FieldType.number,
              values: _.map(timeseries.flow, (p) => p[1]),
              config: {
                links: [
                  {
                    title: 'Open in Kentik',
                    url: explorerUrl,
                    targetBlank: true,
                  },
                ],
              },
            },
          ],
        };

        frames.push(frame);
      } else {
        // NMS / SNMP data: the API returns scalar aggregate values on the row
        // (e.g. avg_ktappprotocol__snmp_device_metrics__INT64_00) but no
        // timeSeries flow data.  Create a flat two-point series spanning the
        // query time range so Grafana renders something useful.
        const metricKey = query.outsort || query.aggregateTypes?.[0];
        const metricValue = metricKey != null ? series[metricKey] : undefined;

        if (metricValue != null) {
          const startMs = new Date(query.starting_time + ' UTC').getTime();
          const endMs = new Date(query.ending_time + ' UTC').getTime();

          const frame: PartialDataFrame = {
            meta: frameMeta,
            fields: [
              {
                name: 'time',
                type: FieldType.time,
                values: [startMs, endMs],
              },
              {
                name: seriesName,
                type: FieldType.number,
                values: [metricValue, metricValue],
                config: {
                  links: [
                    {
                      title: 'Open in Kentik',
                      url: explorerUrl,
                      targetBlank: true,
                    },
                  ],
                },
              },
            ],
          };

          frames.push(frame);
        }
      }
    }

    return frames;
  }

  applyAliasPattern(series: any, query: any, target: any): string {
    const agg = query.aggregates?.[0];
    // $col          → friendly aggregate label (e.g. "95th Percentile")
    // $metric_group → metric group name  (e.g. "SNMP Device CPU (%)")
    // Fall back to raw name so the field never disappears entirely.
    const colName = agg?.label || agg?.origLabel || agg?.name || query.aggregateTypes?.[0] || '';
    const metricGroupName = agg?.group || colName;
    const { aliasBy, prefix = '' } = target;

    // Resolve Grafana variables using the 'text' format so that multi-value variables
    // display their human-readable text (e.g. "All") instead of expanding to every value
    // (e.g. "{val1,val2,...}"). This also allows patterns like {{$dimension}} to resolve
    // to {{field}} for subsequent tag substitution.
    const resolvedAliasBy = this.templateSrv.replace(aliasBy, target.scopedVars, 'text');
    const resolvedPrefix = this.templateSrv.replace(prefix, target.scopedVars, 'text');

    const replaceTag = (match: string, tagName: string) => {
      // Find dimension if tagName is a label or an ID
      const dim = dimensionList.find(
        (d) =>
          d.text.toLowerCase() === tagName.toLowerCase() ||
          d.value.toLowerCase() === tagName.toLowerCase() ||
          d.field.toLowerCase() === tagName.toLowerCase()
      );
      const effectiveTagName = dim ? dim.field : tagName;

      // Collect all candidate property names: tagName, field, value, text, plus
      // common Kentik prefixed variants (i_<name>, <name>_name, i_<name>_name).
      const candidates = new Set<string>([tagName, effectiveTagName]);
      if (dim) {
        candidates.add(dim.value);
        candidates.add(dim.text);
      }
      // Kentik often returns display-name fields with a _name suffix
      // e.g. Proto's display value might be in "i_proto_name" or "Proto_name"
      for (const base of [tagName, effectiveTagName]) {
        candidates.add(`i_${base.toLowerCase()}`);
        candidates.add(`${base}_name`);
        candidates.add(`i_${base.toLowerCase()}_name`);
      }

      // 1. Try exact match on series property for any candidate
      for (const candidate of candidates) {
        if (!_.isNil(series[candidate])) {
          return series[candidate];
        }
      }

      // 2. Try case-insensitive match on series properties
      const lowerCandidates = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
      const foundKey = Object.keys(series).find(
        (key) => lowerCandidates.has(key.toLowerCase())
      );
      if (foundKey && !_.isNil(series[foundKey])) {
        return series[foundKey];
      }

      // 3. For SNMP/ST queries, try matching the tail of ktappprotocol__ keys.
      //    e.g. {{device}} → effectiveTagName "i_device_id" matches the tail of
      //    "ktappprotocol__snmp_device_metrics__i_device_name".
      //    Also try common friendly-name → SNMP suffix mappings.
      const snmpSuffixMap: Record<string, string[]> = {
        'device': ['i_device_name'],
        'site': ['i_device_site_name'],
        'i_device_id': ['i_device_name'],
        'i_device_site_name': ['i_device_site_name'],
      };
      const suffixes = snmpSuffixMap[tagName.toLowerCase()] || snmpSuffixMap[effectiveTagName.toLowerCase()] || [effectiveTagName];
      for (const suffix of suffixes) {
        const snmpKey = Object.keys(series).find(
          (key) => key.startsWith('ktappprotocol__') && key.endsWith('__' + suffix)
        );
        if (snmpKey && !_.isNil(series[snmpKey])) {
          return series[snmpKey];
        }
      }

      // 4. Try extracting from series.key by dimension index (common for TopX)
      if (query.dimension && Array.isArray(query.dimension)) {
        const dimIndex = query.dimension.findIndex(
          (d: string) => d.toLowerCase() === tagName.toLowerCase() || d.toLowerCase() === effectiveTagName.toLowerCase()
        );
        if (dimIndex !== -1 && series.key) {
          const keyParts = series.key.split(',');
          if (keyParts.length > dimIndex) {
            return keyParts[dimIndex];
          }
        }
      }

      // Tag not found — return the original token unchanged
      return match;
    };

    let result = '';
    if (!resolvedAliasBy) {
      const seriesKey = series.key || '';
      const suffix = colName ? ` (${colName})` : '';
      result = resolvedPrefix ? `${resolvedPrefix} ${seriesKey}${suffix}` : `${seriesKey}${suffix}`;
    } else {
      result = resolvedPrefix ? `${resolvedPrefix} ${resolvedAliasBy}` : resolvedAliasBy;
    }

    // Apply substitutions to the entire resulting string
    // $tag_ is restricted to non-whitespace to avoid greediness
    // {{...}} supports spaces/dashes as it is explicitly delimited
    result = result.replace(/\$tag_([a-zA-Z0-9_\.]+)/g, replaceTag);
    result = result.replace(/\{\{([a-zA-Z0-9_\.\s\-]+)\}\}/g, replaceTag);
    result = result.replace(/\$col/g, colName);
    result = result.replace(/\$metric_group/g, metricGroupName);
    // Legacy: support bare $metric as alias for $metric_group
    result = result.replace(/\$metric/g, metricGroupName);

    // Final pass: resolve any remaining Grafana variables (e.g. $__interval).
    // Use 'text' format to keep multi-value variables human-readable.
    return this.templateSrv.replace(result, target.scopedVars, 'text');
  }

  inferMetricFromUnit(unit: string): 'bps' | 'pps' | 'fps' | 'none' {
    switch (unit) {
      case 'bytes':
        return 'bps';
      case 'packets':
        return 'pps';
      case 'fps':
        return 'fps';
      default:
        return 'none';
    }
  }

  processTableData(bucketData: any[], dimensionDefs: any[], metricDefs: any[]) {
    const dimensionColumns = dimensionDefs.map((def) => ({
      name: def.text,
      type: FieldType.string,
      values: [] as string[],
    }));

    const metricColumns = metricDefs.map((def: Metric) => ({
      name: def.value,
      type: FieldType.number,
      values: [] as number[],
      config: { unit: this.inferMetricFromUnit(def.unit) },
    }));

    _.forEach(bucketData, (row) => {
      dimensionDefs.forEach((def: any, i: number) => {
        let val = row[def.field];

        // Fallback to key if field is missing (e.g. for single dimension or unmapped fields)
        if (val === undefined || val === null) {
          if (dimensionDefs.length === 1 && row.key) {
            val = row.key;
          }
        }
        dimensionColumns[i].values.push(val);
      });

      metricDefs.forEach((metricDef, i) => {
        let val = row[metricDef.value];
        if (_.isString(val)) {
          val = parseFloat(val);
        }
        metricColumns[i].values.push(val);
      });
    });

    const frame: PartialDataFrame = {
      fields: [...dimensionColumns, ...metricColumns],
    };

    return frame;
  }

  async metricFindQuery(query: string, target?: any) {
    const interpolatedQuery = this.templateSrv.replace(query, target?.scopedVars);
    const queryParts = interpolatedQuery.match(/^(.*)\((.*)\)$/);
    if (!queryParts || !queryParts[1]) {
      throw new Error(`Invalid query syntax. Expected syntax: queryType()`);
    }

    const queryType = queryParts[1];
    switch (queryType) {
      case 'dimensions': {
        const result = await this._getExtendedDimensionList(dimensionList);
        return result;
      }
      case 'metrics': {
        return metricNestedList;
      }
      case 'metricsOptions': {
        return allMetricOptions;
      }
      case 'devices': {
        let devices = await this.kentik.getDevices();

        const sitesRaw = target?.sites;
        const siteNames = this.templateSrv.replace(
          typeof sitesRaw === 'string' ? sitesRaw : (sitesRaw?.map((s: any) => s.value) || []).join(','),
          target?.scopedVars,
          this.interpolateDeviceField.bind(this)
        );

        let filterSites: string[] = [];
        // Only add UI sites if not "All Sites"
        if (siteNames && siteNames !== ALL_SITES_LABEL) {
          filterSites = siteNames.split(',');
        }

        // Add sites from query arguments (e.g. devices($Site))
        const args = queryParts[2];
        if (args && args.trim().length > 0) {
          const argSites = args.split(',').map((s) => s.trim());
          filterSites = _.concat(filterSites, argSites);
        }

        // Apply handling for All Sites if arguments are present but contain "All Sites" variable value?
        // Standard Grafana: if variable is "All", it returns all values separated by comma (if formatted) or regex.
        // If the user uses devices($Site) and $Site is "All", regex matching might be needed?
        // But here we do exact match includes.
        // If $Site uses "All" and "Include All option", and custom all value is empty?

        if (filterSites.length > 0 && !filterSites.includes(ALL_SITES_LABEL)) {
          // Filter if we have specific sites and none of them is explicit "All Sites"
          // (though standard All usually expands to values)
          devices = _.filter(devices, (device) => filterSites.includes(device.site.siteName));
        }

        return [{ text: ALL_DEVICES_LABEL, value: ALL_DEVICES_LABEL }, ...devices.map((device: any) => {
          return { text: device.deviceName, value: device.deviceName };
        })];
      }
      case 'sites': {
        const sites = await this.kentik.getSites();
        const res = sites.map((site: any) => {
          const text = site.title || site.siteName || site.site_name || site.name || site.id;
          return { text, value: text };
        });
        return [{ text: ALL_SITES_LABEL, value: ALL_SITES_LABEL }, ...res];
      }
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  findDimension(query: { text?: string; value?: string }): Dimension | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const dimension = _.find<Dimension>(dimensionList, query);
    if (dimension === undefined) {
      return null;
    }

    return dimension;
  }

  findMetric(query: { text?: string; value?: string }): Metric | null {
    if (query.text === undefined && query.value === undefined) {
      throw new Error('At least one of text / value must be defined');
    }
    const metric = _.find<Metric>(allMetricOptions, query);
    if (metric === undefined) {
      return null;
    }

    return metric;
  }

  async getTagKeys() {
    const initialList = await this._getExtendedDimensionList(filterFieldList);
    const savedFiltersResp = await this.kentik.getSavedFilters();
    const savedFilters = savedFiltersResp.filters || savedFiltersResp;
    return _.concat(initialList, Array.isArray(savedFilters) ? savedFilters : []);
  }

  async getTagValues(options: any) {
    if (options) {
      let filter = _.find<FilterField>(filterFieldList, { text: options.key });
      if (filter === undefined) {
        const savedFiltersResp = await this.kentik.getSavedFilters();
        const savedFilters = savedFiltersResp.filters || savedFiltersResp;
        filter = _.find(Array.isArray(savedFilters) ? savedFilters : [], { text: options.key });
        if (filter === undefined) {
          const customDimensions = await this.kentik.getCustomDimensions();
          const dimension: any = _.find(customDimensions, { text: options.key });
          if (dimension && dimension.values) {
            return dimension.values.map((value: any) => ({ text: value }));
          }
          return [];
        } else {
          return [{ text: 'include' }, { text: 'exclude' }];
        }
      } else {
        const field = filter.field;
        const result = await this.kentik.getFieldValues(field);
        return result.rows.map((row: any) => {
          return { text: row[field].toString() };
        });
      }
    } else {
      return [];
    }
  }

  async getCustomDimensions() {
    const customDimensions = await this.kentik.getCustomDimensions();

    const comboboxCustomDimensionOptions = customDimensions.map(
      (customDimension: { text: string; value: string; field: string }) => {
        return {
          label: customDimension.text,
          value: `$${customDimension.field}`,
          originalValue: customDimension.field,
        };
      }
    );

    return comboboxCustomDimensionOptions;
  }

  private async _getExtendedDimensionList(list: any[]) {
    const customDimensions = await this.kentik.getCustomDimensions();
    return _.concat(list, customDimensions);
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    // Clear cached metadata so fresh credentials are used
    await this.kentik.clearCache();

    try {
      const devices = await this.kentik.getDevices();
      return {
        status: 'success',
        message: `OK – found ${Array.isArray(devices) ? devices.length : 0} device(s)`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        message: err?.message || 'Failed to connect to Kentik API',
      };
    }
  }
}
