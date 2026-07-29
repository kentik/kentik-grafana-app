# Kentik Grafana Plugin - AI Development Rules

## Critical: Grafana Datasource Proxy Route Rules

These rules MUST be followed when modifying `src/plugin.json` routes or any proxy-related code. Violating them will cause 415 Unsupported Media Type or 401 Unauthorized errors.

### Rule 1: Route URL must include the path prefix
Grafana's datasource proxy **strips** the matched `path` from the request before forwarding. The `url` field must include the path prefix to compensate.

**CORRECT:**
```json
{"path": "site", "url": "{{ .JsonData.url.v6 }}/site"}
```

**WRONG (causes double-path or missing-path):**
```json
{"path": "site", "url": "{{ .JsonData.url.v6 }}"}
```

### Rule 2: Never add Content-Type header to GET routes
Kentik's gRPC gateway rejects GET requests that include a `Content-Type` header with `415 Unsupported Media Type`. Only add `Content-Type: application/json` to routes that exclusively handle POST requests.

**CORRECT (GET route - no Content-Type):**
```json
{
  "path": "site",
  "url": "{{ .JsonData.url.v6 }}/site",
  "headers": [
    {"name": "X-CH-Auth-Email", "content": "{{ .JsonData.email }}"},
    {"name": "X-CH-Auth-API-Token", "content": "{{ .SecureJsonData.token }}"}
  ]
}
```

**CORRECT (POST-only route - Content-Type included):**
```json
{
  "path": "api/v5",
  "url": "{{ .JsonData.url.v5 }}/api/v5",
  "headers": [
    {"name": "X-CH-Auth-Email", "content": "{{ .JsonData.email }}"},
    {"name": "X-CH-Auth-API-Token", "content": "{{ .SecureJsonData.token }}"},
    {"name": "Content-Type", "content": "application/json"}
  ]
}
```

**WRONG (causes 415 on GET requests):**
```json
{
  "path": "site",
  "headers": [
    {"name": "Content-Type", "content": "application/json"}
  ]
}
```

### Rule 3: SecureJsonData template syntax must use spaces
The correct Go template syntax for secrets in route headers is `{{ .SecureJsonData.token }}` (with spaces). Without spaces, Grafana may fail to render the template.

### Rule 4: Route paths must NOT have leading slashes
Route `path` values must be bare strings without `/` prefix. Leading slashes break Grafana's route matching.

**CORRECT:** `"path": "site"`  
**WRONG:** `"path": "/site"`

### Rule 5: Docker volume for credential persistence
The Docker compose setup uses a named volume (`grafana-storage`) to persist Grafana's database across rebuilds. Never use `docker compose down -v` unless you intend to wipe saved credentials.

### Rule 6: Use UID-based Grafana APIs (Grafana 13+)
Grafana 13 disables numeric-ID datasource APIs by default. Always use `/api/datasources/uid/{uid}` instead of `/api/datasources/{id}`.

### Rule 7: Custom region v5 URL derivation
For custom regions, the v5 (REST) API uses `api.*` not `grpc.api.*`. The `getUrlByRegion()` function strips the `grpc.` prefix when deriving v5 URLs from the user-provided gRPC URL.

## Testing Rules

### Rule 8: Check for empty success responses
When writing or modifying API methods, always verify the response is not null/undefined on success. An API returning HTTP 200 with no body should be treated as suspicious.

### Rule 9: Never commit credentials
Never hardcode API tokens, emails, or other secrets in source files. Use provisioning without `secureJsonData` and enter credentials via the Grafana UI.

## Architecture Notes

- `plugin.json` routes are the **only** way auth headers reach Kentik — the frontend cannot access `secureJsonData`
- The `KentikAPI._get()` and `._post()` methods include auth headers for ConfigEditor validation (where the token is in memory), but at runtime the proxy routes handle authentication
- Route `method: "*"` handles both GET and POST through the same route definition
