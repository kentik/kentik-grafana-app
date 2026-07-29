package plugin

import (
	"bytes"
	"context"
	crand "crypto/rand"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

// Kentik API paths (relative to the v6 base URL).
const (
	pathDictionary = "/dictionary/v20260604alpha1"
	pathQuery      = "/query/v20251204alpha1/execute"
	pathSite       = "/site/v202509/sites"
)

const dictionaryTTL = 5 * time.Minute

// PluginVersion is set at link time via -ldflags by the Mage build
// (-X 'main.version=...'). It is forwarded from main.go into the
// plugin package so the HTTP client can include it in the User-Agent.
var PluginVersion = "dev"

// Retry policy for transient upstream failures (rate-limit / gateway errors).
const (
	maxRetries  = 3
	baseBackoff = 250 * time.Millisecond
	maxBackoff  = 5 * time.Second
)

// kentikClient is a thin authenticated HTTP client for the Kentik v6 APIs with
// an in-memory dictionary cache. A single client is shared across all requests
// for a data source instance.
type kentikClient struct {
	settings dsSettings
	http     *http.Client

	dictMu   sync.Mutex
	dictData []byte
	dictTime time.Time
}

// newKentikClient builds a client around the provided HTTP client. The caller
// (NewDatasource) constructs the HTTP client from the SDK's httpclient package
// so that Grafana's outbound proxy, TLS, and tracing settings are honored.
func newKentikClient(settings dsSettings, httpClient *http.Client) *kentikClient {
	return &kentikClient{
		settings: settings,
		http:     httpClient,
	}
}

// validateAPIURL bounds SSRF exposure from the admin-configured region / custom
// API URL: the base URL is only used to build outbound requests after it has
// been confirmed to be a well-formed http(s) origin with a hostname and no
// embedded credentials. Non-http(s) schemes (file, gopher, dict, ...), missing
// hosts, and userinfo (which could smuggle a different target) are rejected
// before any request is issued.
func validateAPIURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid Kentik API URL: %w", err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("kentik API URL must use http or https (got %q)", u.Scheme)
	}
	if u.Hostname() == "" {
		return fmt.Errorf("kentik API URL is missing a host")
	}
	if u.User != nil {
		return fmt.Errorf("kentik API URL must not contain embedded credentials")
	}
	return nil
}

// doRequest performs an authenticated request against the Kentik v6 API,
// retrying transient failures (network errors, HTTP 429, HTTP 502) with bounded
// exponential backoff. A Content-Type header is added only for requests that
// carry a body (POST), since Kentik's gRPC gateway rejects GET requests that
// include Content-Type with 415.
func (c *kentikClient) doRequest(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	reqURL := c.settings.baseURL() + path
	if err := validateAPIURL(reqURL); err != nil {
		return nil, 0, err
	}

	var (
		lastErr    error
		lastData   []byte
		lastStatus int
		retryAfter time.Duration
	)

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, 0, ctx.Err()
			case <-time.After(backoffDelay(attempt, retryAfter)):
			}
			retryAfter = 0
		}

		var reader io.Reader
		if body != nil {
			reader = bytes.NewReader(body)
		}

		req, err := http.NewRequestWithContext(ctx, method, reqURL, reader)
		if err != nil {
			return nil, 0, fmt.Errorf("build request: %w", err)
		}

		req.Header.Set("X-CH-Auth-Email", c.settings.Email)
		req.Header.Set("X-CH-Auth-API-Token", c.settings.token)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "kentik-grafana-plugin/"+PluginVersion)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		// The destination is the admin-configured Kentik API base URL, structurally
		// validated by validateAPIURL above (http/https origin, host present, no
		// embedded credentials) and dispatched via the SDK httpclient, which honors
		// Grafana's outbound egress proxy. It is not attacker- or query-controlled,
		// so gosec's SSRF taint finding here is a false positive.
		resp, err := c.http.Do(req) // #nosec G704 -- validated admin-config URL, not user input
		if err != nil {
			// Network/transport error — retry.
			lastErr = fmt.Errorf("request to %s: %w", path, err)
			continue
		}

		data, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("read response from %s: %w", path, readErr)
			continue
		}

		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusBadGateway {
			lastData, lastStatus = data, resp.StatusCode
			lastErr = fmt.Errorf("request to %s returned HTTP %d", path, resp.StatusCode)
			retryAfter = parseRetryAfter(resp.Header.Get("Retry-After"))
			continue
		}

		return data, resp.StatusCode, nil
	}

	// Retries exhausted. Prefer returning the last upstream response (so the
	// caller can surface the HTTP status/body) over a bare transport error.
	if lastData != nil {
		return lastData, lastStatus, nil
	}
	return nil, 0, lastErr
}

// cryptoRandInt63n returns a uniform random int64 in [0, n) using crypto/rand.
// Used for retry jitter and request-id generation so the codebase avoids the
// weak math/rand generator (gosec G404). On the practically impossible error
// path it returns 0, which degrades gracefully without panicking.
func cryptoRandInt63n(n int64) int64 {
	if n <= 0 {
		return 0
	}
	v, err := crand.Int(crand.Reader, big.NewInt(n))
	if err != nil {
		return 0
	}
	return v.Int64()
}

// backoffDelay returns the wait before the given attempt, honoring an explicit
// Retry-After hint when present, otherwise exponential backoff with jitter.
func backoffDelay(attempt int, retryAfter time.Duration) time.Duration {
	if retryAfter > 0 {
		if retryAfter > maxBackoff {
			return maxBackoff
		}
		return retryAfter
	}
	delay := baseBackoff << (attempt - 1)
	if delay > maxBackoff {
		delay = maxBackoff
	}
	// Full jitter to avoid synchronized retries.
	return time.Duration(cryptoRandInt63n(int64(delay) + 1))
}

// parseRetryAfter parses the delay-seconds form of a Retry-After header. The
// HTTP-date form is ignored (falls back to exponential backoff).
func parseRetryAfter(v string) time.Duration {
	if v == "" {
		return 0
	}
	secs, err := strconv.Atoi(v)
	if err != nil || secs < 0 {
		return 0
	}
	return time.Duration(secs) * time.Second
}

// getSites calls the Site API; used by the health check to validate credentials.
func (c *kentikClient) getSites(ctx context.Context) (int, []byte, error) {
	data, status, err := c.doRequest(ctx, http.MethodGet, pathSite, nil)
	return status, data, err
}

// execute runs a UDE query via the Query API.
func (c *kentikClient) execute(ctx context.Context, payload []byte) ([]byte, int, error) {
	return c.doRequest(ctx, http.MethodPost, pathQuery, payload)
}

// getDictionary returns the raw dictionary JSON, serving from cache when fresh.
func (c *kentikClient) getDictionary(ctx context.Context) ([]byte, error) {
	c.dictMu.Lock()
	defer c.dictMu.Unlock()

	if c.dictData != nil && time.Since(c.dictTime) < dictionaryTTL {
		return c.dictData, nil
	}

	data, status, err := c.doRequest(ctx, http.MethodGet, pathDictionary, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("dictionary request failed: HTTP %d: %s", status, string(data))
	}

	c.dictData = data
	c.dictTime = time.Now()
	return data, nil
}

// invalidateDictionary clears the cached dictionary (e.g. after a config change).
func (c *kentikClient) invalidateDictionary() {
	c.dictMu.Lock()
	defer c.dictMu.Unlock()
	c.dictData = nil
	c.dictTime = time.Time{}
}
