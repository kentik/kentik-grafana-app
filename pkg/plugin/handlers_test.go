package plugin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// newTestDatasource builds a Datasource pointed at the given test server URL.
func newTestDatasource(serverURL, email, token string) *Datasource {
	settings := dsSettings{URL: kentikURL{V6: serverURL}, Email: email, token: token}
	ds := &Datasource{client: newKentikClient(settings, http.DefaultClient)}
	ds.resource = ds.newResourceHandler()
	return ds
}

// ── CheckHealth ──────────────────────────────────────────────────────────────

func TestCheckHealthOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "" {
			t.Errorf("GET request must not send Content-Type, got %q", r.Header.Get("Content-Type"))
		}
		switch r.URL.Path {
		case pathSite:
			if r.Header.Get("X-CH-Auth-Email") != "me@example.com" {
				t.Errorf("missing auth email header")
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"sites":[{"id":"1"}]}`))
		case pathDictionary:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"measurements":[{"name":"/traffic"},{"name":"/nms"}]}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	ds := newTestDatasource(srv.URL, "me@example.com", "tok")
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{})
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if res.Status != backend.HealthStatusOk {
		t.Errorf("status = %v, want OK (%q)", res.Status, res.Message)
	}
	if !strings.Contains(res.Message, "2 measurements") {
		t.Errorf("message = %q, want measurement count", res.Message)
	}
}

func TestCheckHealthMissingCreds(t *testing.T) {
	ds := newTestDatasource("https://grpc.api.kentik.com", "", "")
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{})
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if res.Status != backend.HealthStatusError {
		t.Errorf("status = %v, want Error", res.Status)
	}
}

func TestCheckHealthRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	ds := newTestDatasource(srv.URL, "me@example.com", "bad")
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{})
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if res.Status != backend.HealthStatusError {
		t.Errorf("status = %v, want Error", res.Status)
	}
}

// TestCheckHealthDictionaryUnavailable covers the case where credentials are
// valid (Site API returns 200) but the UDE Dictionary/Query API version is
// decommissioned or otherwise unavailable (e.g. HTTP 501). The health check
// must surface an error rather than reporting "Connected", since queries cannot
// work in that state.
func TestCheckHealthDictionaryUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case pathSite:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"sites":[{"id":"1"}]}`))
		case pathDictionary:
			w.WriteHeader(http.StatusNotImplemented)
			_, _ = w.Write([]byte(`{"code":12,"message":"The server does not implement the method"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	ds := newTestDatasource(srv.URL, "me@example.com", "tok")
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{})
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if res.Status != backend.HealthStatusError {
		t.Errorf("status = %v, want Error (%q)", res.Status, res.Message)
	}
	if !strings.Contains(res.Message, "Credentials are valid") {
		t.Errorf("message = %q, want it to explain credentials are valid but the API is unusable", res.Message)
	}
}

// ── CallResource: dictionary ─────────────────────────────────────────────────

type fakeSender struct{ resp *backend.CallResourceResponse }

func (f *fakeSender) Send(r *backend.CallResourceResponse) error {
	f.resp = r
	return nil
}

func TestCallResourceDictionary(t *testing.T) {
	const body = `{"measurements":[{"name":"/traffic"}]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != pathDictionary {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	ds := newTestDatasource(srv.URL, "me@example.com", "tok")
	sender := &fakeSender{}
	err := ds.CallResource(context.Background(), &backend.CallResourceRequest{
		Path:   "dictionary",
		Method: http.MethodGet,
		URL:    "dictionary",
	}, sender)
	if err != nil {
		t.Fatalf("CallResource error: %v", err)
	}
	if sender.resp == nil {
		t.Fatal("no response sent")
	}
	if sender.resp.Status != http.StatusOK {
		t.Errorf("status = %d, want 200", sender.resp.Status)
	}
	if string(sender.resp.Body) != body {
		t.Errorf("body = %q, want %q", string(sender.resp.Body), body)
	}
}

func TestCallResourceUnknownPath(t *testing.T) {
	ds := newTestDatasource("https://grpc.api.kentik.com", "me@example.com", "tok")
	sender := &fakeSender{}
	err := ds.CallResource(context.Background(), &backend.CallResourceRequest{
		Path:   "nope",
		Method: http.MethodGet,
		URL:    "nope",
	}, sender)
	if err != nil {
		t.Fatalf("CallResource error: %v", err)
	}
	if sender.resp == nil || sender.resp.Status != http.StatusNotFound {
		t.Errorf("expected 404 for unknown resource, got %+v", sender.resp)
	}
}

// ── Retry / backoff ──────────────────────────────────────────────────────────

func TestDoRequestRetriesOn429(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) <= 2 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	data, status, err := c.doRequest(context.Background(), http.MethodGet, "/x", nil)
	if err != nil {
		t.Fatalf("doRequest error: %v", err)
	}
	if status != http.StatusOK {
		t.Errorf("status = %d, want 200 after retries", status)
	}
	if string(data) != `{"ok":true}` {
		t.Errorf("body = %q", string(data))
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Errorf("calls = %d, want 3", got)
	}
}

func TestDoRequestExhaustsRetries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	_, status, err := c.doRequest(context.Background(), http.MethodGet, "/x", nil)
	if err != nil {
		t.Fatalf("doRequest error: %v", err)
	}
	if status != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 after exhausting retries", status)
	}
	if got := atomic.LoadInt32(&calls); got != maxRetries+1 {
		t.Errorf("calls = %d, want %d", got, maxRetries+1)
	}
}

func TestParseRetryAfter(t *testing.T) {
	cases := []struct {
		in   string
		want time.Duration
	}{
		{"", 0},
		{"5", 5 * time.Second},
		{"0", 0},
		{"-1", 0},
		{"notanumber", 0},
		{"Wed, 21 Oct 2015 07:28:00 GMT", 0},
	}
	for _, c := range cases {
		if got := parseRetryAfter(c.in); got != c.want {
			t.Errorf("parseRetryAfter(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestBackoffDelayHonorsRetryAfter(t *testing.T) {
	if got := backoffDelay(1, 2*time.Second); got != 2*time.Second {
		t.Errorf("backoffDelay with retryAfter = %v, want 2s", got)
	}
	if got := backoffDelay(1, time.Hour); got != maxBackoff {
		t.Errorf("backoffDelay caps at maxBackoff, got %v", got)
	}
	// Jittered exponential is bounded by maxBackoff.
	for attempt := 1; attempt <= 6; attempt++ {
		if got := backoffDelay(attempt, 0); got < 0 || got > maxBackoff {
			t.Errorf("backoffDelay(%d) = %v, out of [0,%v]", attempt, got, maxBackoff)
		}
	}
}

func TestFormatUpstreamError500CrossNamespace(t *testing.T) {
	// DNS metric + SNMP dimension → namespace mismatch detected.
	model := newQueryModel(t, `{"measurement":"/traffic","dimensions":["ktappprotocol__snmp__i_device_site_name"],"metrics":["ktappprotocol__dns_analytics__IN_BYTES"]}`)
	body := []byte(`{"code":13,"message":"An error has occurred. [errorxid: abc123]"}`)
	msg := formatUpstreamError(model, http.StatusInternalServerError, body)

	if !strings.Contains(msg, "snmp") || !strings.Contains(msg, "dns_analytics") {
		t.Errorf("should identify conflicting namespaces: %q", msg)
	}
	if !strings.Contains(msg, "i_device_site_name") {
		t.Errorf("should suggest the universal equivalent: %q", msg)
	}
	if !strings.Contains(msg, "errorxid: abc123") {
		t.Errorf("should include Kentik detail: %q", msg)
	}
}

func TestFormatUpstreamError500Generic(t *testing.T) {
	// Non-namespaced fields → generic message (no namespace conflict).
	model := newQueryModel(t, `{"measurement":"/traffic","dimensions":["kt_aws_src_acc_id"],"metrics":["bytes"]}`)
	body := []byte(`{"code":13,"message":"An error has occurred. [errorxid: xyz]"}`)
	msg := formatUpstreamError(model, http.StatusInternalServerError, body)

	if !strings.Contains(msg, "not supported") {
		t.Errorf("generic message expected: %q", msg)
	}
}

func TestFormatUpstreamErrorNon500(t *testing.T) {
	model := newQueryModel(t, `{"measurement":"/traffic","metrics":["bytes"]}`)
	body := []byte(`{"code":3,"message":"bad request"}`)
	msg := formatUpstreamError(model, http.StatusBadRequest, body)

	if !strings.Contains(msg, "HTTP 400") {
		t.Errorf("message should include status: %q", msg)
	}
	if !strings.Contains(msg, "bad request") {
		t.Errorf("message should include Kentik message: %q", msg)
	}
}

func TestExtractNamespace(t *testing.T) {
	cases := []struct{ in, want string }{
		{"ktappprotocol__snmp__i_device_site_name", "snmp"},
		{"ktappprotocol__dns_analytics__IN_BYTES", "dns_analytics"},
		{"i_device_site_name", ""},
		{"kt_aws_src_acc_id", ""},
		{"ktappprotocol__", ""},
	}
	for _, c := range cases {
		if got := extractNamespace(c.in); got != c.want {
			t.Errorf("extractNamespace(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestUniversalEquivalent(t *testing.T) {
	cases := []struct{ in, want string }{
		{"ktappprotocol__snmp__i_device_site_name", "i_device_site_name"},
		{"ktappprotocol__dns_analytics__IN_BYTES", "IN_BYTES"},
		{"i_device_site_name", ""},
		{"ktappprotocol__", ""},
	}
	for _, c := range cases {
		if got := universalEquivalent(c.in); got != c.want {
			t.Errorf("universalEquivalent(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestDetectNamespaceMismatch(t *testing.T) {
	// Cross-namespace: DNS metric + SNMP dimension.
	hint := detectNamespaceMismatch(
		[]string{"ktappprotocol__snmp__i_device_site_name"},
		[]string{"ktappprotocol__dns_analytics__IN_BYTES"},
	)
	if hint == "" || !strings.Contains(hint, "snmp") || !strings.Contains(hint, "dns_analytics") {
		t.Errorf("expected mismatch hint with both namespaces, got %q", hint)
	}
	if !strings.Contains(hint, "i_device_site_name") {
		t.Errorf("hint should suggest universal equivalent, got %q", hint)
	}

	// Same namespace: no conflict.
	hint = detectNamespaceMismatch(
		[]string{"ktappprotocol__snmp__i_device_site_name"},
		[]string{"ktappprotocol__snmp__INT05"},
	)
	if hint != "" {
		t.Errorf("same-namespace should not conflict, got %q", hint)
	}

	// Universal fields: never conflict.
	hint = detectNamespaceMismatch(
		[]string{"i_device_site_name"},
		[]string{"ktappprotocol__dns_analytics__IN_BYTES"},
	)
	if hint != "" {
		t.Errorf("universal dim should not conflict, got %q", hint)
	}
}
