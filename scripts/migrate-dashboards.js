#!/usr/bin/env node
/*
 * Migrate Grafana dashboard datasource references from legacy Kentik app
 * identifiers to the new kentik-connect-datasource identifiers.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3000',
    username: process.env.GRAFANA_USERNAME || 'admin',
    password: process.env.GRAFANA_PASSWORD || 'admin',
    apiToken: process.env.GRAFANA_API_TOKEN,
    oldUid: process.env.OLD_DATASOURCE_UID || '',
    oldName: process.env.OLD_DATASOURCE_NAME || '',
    oldType: process.env.OLD_DATASOURCE_TYPE || 'kentik-connect-app',
    newUid: process.env.NEW_DATASOURCE_UID || 'kentik',
    newType: process.env.NEW_DATASOURCE_TYPE || 'kentik-connect-datasource',
    dryRun: true,
    includeProvisioned: false,
    backupDir: process.env.MIGRATION_BACKUP_DIR || './migration-test/backups',
    dashboardUid: '',
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    if (key === 'dry-run') {
      args.dryRun = true;
      continue;
    }
    if (key === 'no-dry-run') {
      args.dryRun = false;
      continue;
    }
    if (key === 'include-provisioned') {
      args.includeProvisioned = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for argument: ${token}`);
    }
    i += 1;

    switch (key) {
      case 'grafana-url':
        args.grafanaUrl = next;
        break;
      case 'username':
        args.username = next;
        break;
      case 'password':
        args.password = next;
        break;
      case 'api-token':
        args.apiToken = next;
        break;
      case 'old-uid':
        args.oldUid = next;
        break;
      case 'old-name':
        args.oldName = next;
        break;
      case 'old-type':
        args.oldType = next;
        break;
      case 'new-uid':
        args.newUid = next;
        break;
      case 'new-type':
        args.newType = next;
        break;
      case 'backup-dir':
        args.backupDir = next;
        break;
      case 'dashboard-uid':
        args.dashboardUid = next;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function buildAuthHeaders(args) {
  if (args.apiToken) {
    return {
      Authorization: `Bearer ${args.apiToken}`,
    };
  }

  const basic = Buffer.from(`${args.username}:${args.password}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
  };
}

async function grafanaRequest(args, method, apiPath, body) {
  const url = `${args.grafanaUrl.replace(/\/+$/, '')}${apiPath}`;
  const headers = {
    ...buildAuthHeaders(args),
    Accept: 'application/json',
  };

  const options = {
    method,
    headers,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_err) {
    json = null;
  }

  if (!response.ok) {
    const detail = json ? JSON.stringify(json) : text;
    throw new Error(`${method} ${apiPath} failed: ${response.status} ${detail}`);
  }

  return json;
}

function datasourceMatches(value, args) {
  if (!value) {
    return false;
  }

  if (typeof value === 'string') {
    return Boolean(args.oldName) && value === args.oldName;
  }

  if (typeof value !== 'object') {
    return false;
  }

  if (args.oldUid && value.uid === args.oldUid) {
    return true;
  }
  if (args.oldType && value.type === args.oldType) {
    return true;
  }
  if (args.oldName && value.name === args.oldName) {
    return true;
  }

  return false;
}

function rewriteDashboardRefs(node, args, counters) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      rewriteDashboardRefs(item, args, counters);
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'datasource' && datasourceMatches(value, args)) {
      node[key] = {
        type: args.newType,
        uid: args.newUid,
      };
      counters.datasource += 1;
      continue;
    }

    if (key === 'datasourceUid' && typeof value === 'string' && args.oldUid && value === args.oldUid) {
      node[key] = args.newUid;
      counters.datasourceUid += 1;
      continue;
    }

    rewriteDashboardRefs(value, args, counters);
  }
}

function ensureBackupDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function loadDashboards(args) {
  if (args.dashboardUid) {
    const dash = await grafanaRequest(args, 'GET', `/api/dashboards/uid/${args.dashboardUid}`);
    return [
      {
        uid: args.dashboardUid,
        title: dash.dashboard?.title || args.dashboardUid,
      },
    ];
  }

  const result = await grafanaRequest(args, 'GET', '/api/search?type=dash-db&limit=5000');
  return (result || []).map((entry) => ({ uid: entry.uid, title: entry.title }));
}

async function migrateDashboard(args, item) {
  const details = await grafanaRequest(args, 'GET', `/api/dashboards/uid/${item.uid}`);
  const dashboard = details.dashboard;
  const meta = details.meta || {};

  if (!dashboard) {
    return { status: 'skipped', reason: 'missing-dashboard', item };
  }

  if (meta.provisioned && !args.includeProvisioned) {
    return { status: 'skipped', reason: 'provisioned', item };
  }

  const workingCopy = JSON.parse(JSON.stringify(dashboard));
  const counters = { datasource: 0, datasourceUid: 0 };
  rewriteDashboardRefs(workingCopy, args, counters);

  const changed = counters.datasource + counters.datasourceUid > 0;
  if (!changed) {
    return { status: 'unchanged', item, counters };
  }

  ensureBackupDir(args.backupDir);
  const backupPath = path.join(args.backupDir, `${item.uid}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(details, null, 2));

  if (!args.dryRun) {
    await grafanaRequest(args, 'POST', '/api/dashboards/db', {
      dashboard: workingCopy,
      folderId: dashboard.folderId || 0,
      overwrite: true,
      message: 'kentik datasource migration: auto-rewrite datasource references',
    });
  }

  return {
    status: args.dryRun ? 'dry-run' : 'updated',
    item,
    counters,
    backupPath,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.oldUid && !args.oldName && !args.oldType) {
    throw new Error('At least one of --old-uid, --old-name, or --old-type must be provided.');
  }

  console.log(`Grafana: ${args.grafanaUrl}`);
  console.log(`Mode: ${args.dryRun ? 'dry-run' : 'apply'}`);
  console.log(`Rewrite to datasource: type=${args.newType}, uid=${args.newUid}`);

  const dashboards = await loadDashboards(args);
  console.log(`Discovered dashboards: ${dashboards.length}`);

  let updated = 0;
  let dryRun = 0;
  let unchanged = 0;
  let skipped = 0;
  let totalRefs = 0;

  for (const item of dashboards) {
    const result = await migrateDashboard(args, item);
    const prefix = `${item.uid} (${item.title})`;

    if (result.status === 'updated') {
      updated += 1;
      totalRefs += result.counters.datasource + result.counters.datasourceUid;
      console.log(`UPDATED  ${prefix} refs=${result.counters.datasource + result.counters.datasourceUid}`);
      continue;
    }

    if (result.status === 'dry-run') {
      dryRun += 1;
      totalRefs += result.counters.datasource + result.counters.datasourceUid;
      console.log(`DRY-RUN  ${prefix} refs=${result.counters.datasource + result.counters.datasourceUid}`);
      continue;
    }

    if (result.status === 'unchanged') {
      unchanged += 1;
      console.log(`UNCHANGED ${prefix}`);
      continue;
    }

    skipped += 1;
    console.log(`SKIPPED  ${prefix} (${result.reason})`);
  }

  console.log('');
  console.log(`Summary: updated=${updated}, dryRun=${dryRun}, unchanged=${unchanged}, skipped=${skipped}, refsRewritten=${totalRefs}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
