#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USERNAME = process.env.GRAFANA_USERNAME || 'admin';
const PASSWORD = process.env.GRAFANA_PASSWORD || 'admin';
const DASHBOARD_PATH = process.env.MIGRATION_TEST_DASHBOARD || 'migration-test/dashboards/legacy-v17-test.json';
const UID = process.env.MIGRATION_TEST_UID || 'legacy-v17-test';

function authHeaders() {
  const basic = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function request(method, apiPath, body) {
  const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}${apiPath}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_err) {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`${method} ${apiPath} failed: ${response.status} ${text}`);
  }

  return json;
}

async function waitForGrafana(maxAttempts = 60) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const health = await request('GET', '/api/health');
      if (health && health.database === 'ok') {
        console.log('Grafana is healthy');
        return;
      }
    } catch (_err) {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Grafana did not become healthy in time. Start it with: docker compose up -d --build');
}

function findLegacyRefs(node, hits) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      findLegacyRefs(item, hits);
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'datasource') {
      if (typeof value === 'string' && value === 'Kentik Connect Pro') {
        hits.push('datasource:string:Kentik Connect Pro');
      } else if (value && typeof value === 'object') {
        if (value.type === 'kentik-connect-app' || value.uid === 'kentik-connect-app') {
          hits.push(`datasource:object:${JSON.stringify(value)}`);
        }
      }
    }

    if (key === 'datasourceUid' && value === 'kentik-connect-app') {
      hits.push('datasourceUid:kentik-connect-app');
    }

    findLegacyRefs(value, hits);
  }
}

function assertMigrated(dashboard) {
  const refs = [];
  findLegacyRefs(dashboard, refs);
  if (refs.length > 0) {
    throw new Error(`Migration failed. Legacy references remain: ${refs.join(', ')}`);
  }

  let hasNewDatasourceRef = false;
  const checker = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        checker(item);
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'datasource' && value && typeof value === 'object') {
        if (value.type === 'kentik-connect-datasource' && value.uid === 'kentik') {
          hasNewDatasourceRef = true;
        }
      }
      checker(value);
    }
  };
  checker(dashboard);

  if (!hasNewDatasourceRef) {
    throw new Error('Migration failed. No kentik-connect-datasource references were found.');
  }
}

function runMigrationScript() {
  const scriptPath = path.resolve('scripts/migrate-dashboards.js');
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--grafana-url', BASE_URL,
      '--username', USERNAME,
      '--password', PASSWORD,
      '--dashboard-uid', UID,
      '--old-type', 'kentik-connect-app',
      '--old-uid', 'kentik-connect-app',
      '--old-name', 'Kentik Connect Pro',
      '--new-type', 'kentik-connect-datasource',
      '--new-uid', 'kentik',
      '--no-dry-run',
      '--backup-dir', 'migration-test/backups',
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    throw new Error('Dashboard migration script failed.');
  }
}

async function main() {
  await waitForGrafana();

  const dashboardJson = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));

  console.log(`Importing legacy fixture dashboard: ${UID}`);
  await request('POST', '/api/dashboards/db', {
    dashboard: dashboardJson,
    overwrite: true,
    message: 'migration-test: import legacy v1.7 fixture',
  });

  console.log('Running migration script...');
  runMigrationScript();

  console.log('Validating migrated dashboard...');
  const latest = await request('GET', `/api/dashboards/uid/${UID}`);
  assertMigrated(latest.dashboard);

  console.log('PASS: Local migration test succeeded (v1.7-style dashboard -> v2.0.1 datasource refs).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
