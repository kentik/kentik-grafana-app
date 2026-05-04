import { KentikAPI } from '../kentik_api';
import { KentikProxy } from '../kentik_proxy';
import * as fs from 'fs';
import * as path from 'path';

describe('KentikProxy', () => {
  const ctx: any = {};

  describe('When getting custom dimensions', () => {
    const data = {
      dimensions: [
        {
          description: 'just-testing',
          name: 'c_test',
          populators: [{ value: 'value1' }, { value: 'value2' }],
        },
        {
          description: 'just-testing-2',
          name: 'c_test_2',
          populators: [{ value: 'value3' }, { value: 'value4' }],
        },
      ],
    };
    beforeEach(() => getKentikProxyInstance(ctx, data));

    it('Should parse it properly', async () => {
      const dimensions = await ctx.kentikProxy.getCustomDimensions();
      expect(dimensions).toHaveLength(2);
      expect(dimensions[0]).toEqual({
        text: 'Custom just-testing',
        value: 'c_test',
        field: 'c_test',
        values: ['value1', 'value2'],
      });
      expect(dimensions[1]).toEqual({
        text: 'Custom just-testing-2',
        value: 'c_test_2',
        field: 'c_test_2',
        values: ['value3', 'value4'],
      });
    });
  });
});

function getKentikProxyInstance(ctx: any, data: any) {
  ctx.backendSrv = {
    get: () => {
      return Promise.resolve([
        {
          type: 'kentik-connect-datasource',
          jsonData: {
            region: 'default',
          },
        },
      ]);
    },
    fetch: () => {
      return {
        toPromise: () =>
          Promise.resolve({
            status: 200,
            data,
          }),
        subscribe: (observer: any) => {
          observer.next({
            status: 200,
            data,
          });
          observer.complete();
        },
      };
    },
  };

  ctx.kentikAPI = new KentikAPI(ctx.backendSrv, 'uid');
  ctx.kentikProxy = new KentikProxy(ctx.kentikAPI);
}

// ── plugin.json proxy route hygiene ───────────────────────────────────────
// Guards against the leading-slash route path bug that caused 502 errors on
// Grafana 11.x (the proxy regex strips the leading slash from proxyPath, so
// route paths with a leading slash never match `strings.HasPrefix`).

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_ROOT = path.resolve(REPO_ROOT, 'src');

function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(SRC_ROOT, relPath), 'utf-8');
}

function readPluginJson(): any {
  return JSON.parse(readSource('plugin.json'));
}

describe('plugin.json proxy route hygiene', () => {
  const plugin = readPluginJson();
  const routes: Array<{ path: string; url: string; method: string }> = plugin.routes || [];

  it('route paths must not start with a leading slash', () => {
    const violations = routes
      .filter((r) => r.path.startsWith('/'))
      .map((r) => `path "${r.path}" starts with /`);
    expect(violations).toEqual([]);
  });

  it('route paths must be unique', () => {
    const paths = routes.map((r) => r.path);
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });

  it('every route must include auth headers', () => {
    const violations = routes
      .filter((r: any) => {
        const headers: Array<{ name: string }> = r.headers || [];
        return !headers.some((h) => h.name === 'X-CH-Auth-API-Token');
      })
      .map((r) => `route "${r.path}" missing X-CH-Auth-API-Token header`);
    expect(violations).toEqual([]);
  });

  it('kentik_api.ts request URLs must match a declared route path', () => {
    const apiSource = readSource('datasource/kentik_api.ts');

    const addPrefixes = (url: string, set: Set<string>) => {
      const normalized = url.startsWith('/') ? url.slice(1) : url;
      const segments = normalized.split('/');
      if (segments[0]) { set.add(segments[0]); }
      if (segments.length > 1 && segments[1]) {
        set.add(segments[0] + '/' + segments[1]);
      }
    };

    const usedPrefixes = new Set<string>();

    // Direct calls: this._get('/device/...'), this._post('/api/v5/...')
    const directPattern = /this\._(?:get|post|put)\(\s*['"`]\/([^'"`]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = directPattern.exec(apiSource)) !== null) {
      addPrefixes(match[1], usedPrefixes);
    }

    // Indirect URLs: string literals like '/api/v5/query/topXdata' passed
    // to constructors (e.g. BatchQueryScheduler) that ultimately call _post
    const indirectPattern = /new\s+\w+\([^)]*['"`](\/[a-z][^'"`]+)['"`]/g;
    while ((match = indirectPattern.exec(apiSource)) !== null) {
      addPrefixes(match[1], usedPrefixes);
    }

    // Keep only the most specific prefix (e.g. "api/v5" not "api")
    const specificPrefixes = new Set<string>();
    for (const prefix of usedPrefixes) {
      const hasMoreSpecific = [...usedPrefixes].some(
        (other) => other !== prefix && other.startsWith(prefix + '/')
      );
      if (!hasMoreSpecific) {
        specificPrefixes.add(prefix);
      }
    }

    const routePaths = new Set(routes.map((r) => r.path));
    const unmatched: string[] = [];
    for (const prefix of specificPrefixes) {
      const hasRoute = [...routePaths].some((rp) => rp === prefix || prefix.startsWith(rp));
      if (!hasRoute) {
        unmatched.push(`API prefix "${prefix}" has no matching route in plugin.json`);
      }
    }
    expect(unmatched).toEqual([]);
  });
});
