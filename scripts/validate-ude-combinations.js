#!/usr/bin/env node
/*
 * Validate UDE Query API compatibility across dictionary combinations.
 *
 * Runs through all measurement/metric combinations (optionally dimensioned)
 * and reports failures with status + upstream error payload.
 *
 * Usage examples:
 *   node scripts/validate-ude-combinations.js
 *   node scripts/validate-ude-combinations.js --uid kentik --lookback 3600 --window 60
 *   node scripts/validate-ude-combinations.js --with-dimensions --max-dimensions 3
 */

const DEFAULTS = {
  baseUrl: process.env.GRAFANA_URL || 'http://localhost:3000',
  uid: process.env.KENTIK_DS_UID || 'kentik',
  lookbackSec: Number(process.env.UDE_LOOKBACK_SEC || 3600),
  windowSec: Number(process.env.UDE_WINDOW_SEC || 60),
  vizType: Number(process.env.UDE_VIZ_TYPE || 3),
  limit: Number(process.env.UDE_LIMIT || 8),
  withDimensions: process.env.UDE_WITH_DIMENSIONS === '1',
  maxDimensionsPerMeasurement: Number(process.env.UDE_MAX_DIMENSIONS || 1),
  maxMetricsPerMeasurement: Number(process.env.UDE_MAX_METRICS || 0), // 0 = all
  metricComboSizes: (process.env.UDE_METRIC_COMBO_SIZES || '1')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
  maxMetricCombosPerMeasurement: Number(process.env.UDE_MAX_METRIC_COMBOS || 0), // 0 = all
  maxMeasurements: Number(process.env.UDE_MAX_MEASUREMENTS || 0), // 0 = all
  measurementIncludes: process.env.UDE_MEASUREMENT_INCLUDES || '',
  includePassesInJson: process.env.UDE_INCLUDE_PASSES === '1',
  requireRows: process.env.UDE_REQUIRE_ROWS === '1',
  minRows: Number(process.env.UDE_MIN_ROWS || 1),
  concurrency: Number(process.env.UDE_CONCURRENCY || 6),
  timeoutMs: Number(process.env.UDE_TIMEOUT_MS || 30000),
};

function parseArgs(argv) {
  const cfg = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--base-url':
        cfg.baseUrl = next;
        i++;
        break;
      case '--uid':
        cfg.uid = next;
        i++;
        break;
      case '--lookback':
        cfg.lookbackSec = Number(next);
        i++;
        break;
      case '--window':
        cfg.windowSec = Number(next);
        i++;
        break;
      case '--viz':
        cfg.vizType = Number(next);
        i++;
        break;
      case '--limit':
        cfg.limit = Number(next);
        i++;
        break;
      case '--with-dimensions':
        cfg.withDimensions = true;
        break;
      case '--max-dimensions':
        cfg.maxDimensionsPerMeasurement = Number(next);
        i++;
        break;
      case '--max-metrics':
        cfg.maxMetricsPerMeasurement = Number(next);
        i++;
        break;
      case '--metric-combo-sizes':
        cfg.metricComboSizes = String(next || '1')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        i++;
        break;
      case '--max-metric-combos':
        cfg.maxMetricCombosPerMeasurement = Number(next);
        i++;
        break;
      case '--max-measurements':
        cfg.maxMeasurements = Number(next);
        i++;
        break;
      case '--measurement-includes':
        cfg.measurementIncludes = next || '';
        i++;
        break;
      case '--include-passes':
        cfg.includePassesInJson = true;
        break;
      case '--require-rows':
        cfg.requireRows = true;
        break;
      case '--min-rows':
        cfg.minRows = Number(next);
        i++;
        break;
      case '--concurrency':
        cfg.concurrency = Number(next);
        i++;
        break;
      case '--timeout-ms':
        cfg.timeoutMs = Number(next);
        i++;
        break;
      default:
        break;
    }
  }
  return cfg;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function buildExecuteRequest(measurement, metrics, dimension, cfg) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - cfg.lookbackSec;
  return {
    query: {
      measurement,
      dimensions: dimension ? [{ name: dimension }] : [],
      metrics: metrics.map((metric) => ({ name: metric })),
      time: {
        lookback: 0,
        start,
        end: now,
      },
      window: { size: cfg.windowSec },
      viz: {
        type: cfg.vizType,
        limit: cfg.limit,
      },
    },
    application_metadata: {
      name: 'kentik-grafana-plugin-validator',
      context: 'dictionary-validation',
    },
    request_id: crypto.randomUUID(),
  };
}

function choose(items, size) {
  const out = [];
  if (size <= 0 || size > items.length) {
    return out;
  }
  const current = [];
  function rec(start, left) {
    if (left === 0) {
      out.push(current.slice());
      return;
    }
    for (let i = start; i <= items.length - left; i++) {
      current.push(items[i]);
      rec(i + 1, left - 1);
      current.pop();
    }
  }
  rec(0, size);
  return out;
}

function enumerateCombos(dict, cfg) {
  const combos = [];
  const filteredMeasurements = (dict.measurements || []).filter((m) => {
    if (!cfg.measurementIncludes) {
      return true;
    }
    return (m?.name || '').includes(cfg.measurementIncludes);
  });
  const sourceMeasurements = cfg.maxMeasurements > 0
    ? filteredMeasurements.slice(0, cfg.maxMeasurements)
    : filteredMeasurements;

  for (const m of sourceMeasurements) {
    const measurement = m.name;
    const metrics = (m.metrics || []).map((x) => x.key).filter(Boolean);
    const dimensions = (m.dimensions || []).map((x) => x.key).filter(Boolean);
    const limitedMetrics =
      cfg.maxMetricsPerMeasurement > 0
        ? metrics.slice(0, cfg.maxMetricsPerMeasurement)
        : metrics;

    let metricCombos = [];
    for (const size of cfg.metricComboSizes.length > 0 ? cfg.metricComboSizes : [1]) {
      metricCombos.push(...choose(limitedMetrics, size));
    }
    if (cfg.maxMetricCombosPerMeasurement > 0) {
      metricCombos = metricCombos.slice(0, cfg.maxMetricCombosPerMeasurement);
    }

    for (const metricSet of metricCombos) {
      combos.push({ measurement, metrics: metricSet, dimension: null });
      if (cfg.withDimensions) {
        for (const dim of dimensions.slice(0, cfg.maxDimensionsPerMeasurement)) {
          combos.push({ measurement, metrics: metricSet, dimension: dim });
        }
      }
    }
  }
  return combos;
}

async function runPool(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;
  async function loop() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, limit) }, () => loop());
  await Promise.all(workers);
  return out;
}

async function main() {
  const cfg = parseArgs(process.argv);
  const dictUrl = `${cfg.baseUrl}/api/datasources/proxy/uid/${cfg.uid}/dictionary/v20260604alpha1`;
  const execUrl = `${cfg.baseUrl}/api/datasources/proxy/uid/${cfg.uid}/query/v20251204alpha1/execute`;

  console.log(`[validate-ude] base=${cfg.baseUrl} uid=${cfg.uid}`);
  console.log(`[validate-ude] fetching dictionary: ${dictUrl}`);
  const dictResp = await fetchWithTimeout(dictUrl, {}, cfg.timeoutMs);
  if (!dictResp.ok) {
    const body = await dictResp.text();
    throw new Error(`Dictionary fetch failed (${dictResp.status}): ${body}`);
  }
  const dict = await dictResp.json();
  const combos = enumerateCombos(dict, cfg);
  console.log(`[validate-ude] combos=${combos.length} withDimensions=${cfg.withDimensions}`);

  const started = Date.now();
  let completed = 0;

  const results = await runPool(combos, cfg.concurrency, async (combo) => {
    try {
      const req = buildExecuteRequest(combo.measurement, combo.metrics, combo.dimension, cfg);
      const resp = await fetchWithTimeout(
        execUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        cfg.timeoutMs
      );
      const text = await resp.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      completed++;
      if (completed % 100 === 0 || completed === combos.length) {
        process.stdout.write(`\r[validate-ude] completed ${completed}/${combos.length}`);
      }

      const rows = (payload?.results?.rows || []).length;
      const timestamps = (payload?.results?.timestamps || []).length;
      const httpOk = resp.ok;
      const dataOk = !cfg.requireRows || rows >= cfg.minRows;
      const effectiveOk = httpOk && dataOk;
      const effectiveError =
        httpOk && !dataOk
          ? { message: `No data rows returned (rows=${rows}, minRows=${cfg.minRows})` }
          : payload;

      return {
        ...combo,
        metricKey: combo.metrics.join('|'),
        ok: effectiveOk,
        status: resp.status,
        rows,
        timestamps,
        error: effectiveOk ? null : effectiveError,
      };
    } catch (err) {
      completed++;
      if (completed % 100 === 0 || completed === combos.length) {
        process.stdout.write(`\r[validate-ude] completed ${completed}/${combos.length}`);
      }
      const message = err && err.name === 'AbortError'
        ? `Request timed out after ${cfg.timeoutMs}ms`
        : (err?.message || 'Request failed');
      return {
        ...combo,
        metricKey: combo.metrics.join('|'),
        ok: false,
        status: 0,
        rows: 0,
        timestamps: 0,
        error: { message },
      };
    }
  });
  process.stdout.write('\n');

  const failures = results.filter((r) => !r.ok);
  const successes = results.filter((r) => r.ok);
  const measurementStats = new Map();
  for (const r of results) {
    const prev = measurementStats.get(r.measurement) || { total: 0, pass: 0, fail: 0 };
    prev.total += 1;
    if (r.ok) {
      prev.pass += 1;
    } else {
      prev.fail += 1;
    }
    measurementStats.set(r.measurement, prev);
  }

  const elapsedMs = Date.now() - started;
  const summary = {
    baseUrl: cfg.baseUrl,
    uid: cfg.uid,
    combos: combos.length,
    passes: successes.length,
    failures: failures.length,
    elapsedMs,
    topFailingMeasurements: Array.from(measurementStats.entries())
      .filter(([, s]) => s.fail > 0)
      .sort((a, b) => b[1].fail - a[1].fail)
      .slice(0, 20)
      .map(([measurement, s]) => ({ measurement, count: s.fail })),
    topWorkingMeasurements: Array.from(measurementStats.entries())
      .filter(([, s]) => s.pass > 0)
      .sort((a, b) => b[1].pass - a[1].pass)
      .slice(0, 20)
      .map(([measurement, s]) => ({ measurement, count: s.pass })),
  };

  console.log('[validate-ude] summary:', JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    console.log('[validate-ude] sample failures:');
    for (const f of failures.slice(0, 20)) {
      const message =
        (f.error && typeof f.error === 'object' && (f.error.message || f.error.error)) ||
        (typeof f.error === 'string' ? f.error : 'unknown');
      console.log(
        `  - ${f.measurement} metrics=${f.metricKey}${f.dimension ? ` dim=${f.dimension}` : ''} status=${f.status} msg=${message}`
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: cfg,
    summary,
    measurementStats: Object.fromEntries(measurementStats),
    failures,
    ...(cfg.includePassesInJson ? { passes: successes } : {}),
  };
  await require('node:fs/promises').writeFile(
    'ude-validation-report.json',
    JSON.stringify(report, null, 2),
    'utf8'
  );
  const csvHeader = 'measurement,metrics,dimension,status,ok,rows,timestamps,error_message\n';
  const csvRows = results
    .map((r) => {
      const msg =
        (r.error && typeof r.error === 'object' && (r.error.message || r.error.error)) ||
        (typeof r.error === 'string' ? r.error : '');
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        esc(r.measurement),
        esc(r.metricKey),
        esc(r.dimension || ''),
        esc(r.status),
        esc(r.ok),
        esc(r.rows),
        esc(r.timestamps),
        esc(msg),
      ].join(',');
    })
    .join('\n');
  await require('node:fs/promises').writeFile('ude-validation-results.csv', csvHeader + csvRows + '\n', 'utf8');
  console.log('[validate-ude] wrote ude-validation-report.json');
  console.log('[validate-ude] wrote ude-validation-results.csv');

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[validate-ude] fatal:', err?.message || err);
  process.exitCode = 2;
});
