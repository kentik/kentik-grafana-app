package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/concurrent"
)

// Datasource is the backend implementation of the Kentik data source. One
// instance is created per configured data source via NewDatasource.
type Datasource struct {
	client   *kentikClient
	resource backend.CallResourceHandler
}

// Interface guards: ensure Datasource satisfies the SDK handler interfaces.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new Datasource instance for the given settings. The
// authenticated client is built once here and reused across all requests.
func NewDatasource(_ context.Context, s backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	settings, err := loadSettings(s.JSONData, s.DecryptedSecureJSONData["token"])
	if err != nil {
		return nil, fmt.Errorf("invalid datasource settings: %w", err)
	}

	// Build the HTTP client options directly rather than via
	// s.HTTPClientOptions(ctx): the latter parses our custom jsonData (which
	// includes a nested `url` object) and panics because it expects certain
	// fields to be strings. httpclient.New still applies the SDK's default
	// middlewares (tracing, outbound proxy, etc.).
	timeout := time.Duration(settings.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	opts := httpclient.Options{
		Timeouts: &httpclient.TimeoutOptions{
			Timeout:   timeout,
			KeepAlive: httpclient.DefaultTimeoutOptions.KeepAlive,
		},
	}

	httpClient, err := httpclient.New(opts)
	if err != nil {
		return nil, fmt.Errorf("new http client: %w", err)
	}

	ds := &Datasource{
		client: newKentikClient(settings, httpClient),
	}
	ds.resource = ds.newResourceHandler()
	return ds, nil
}

// Dispose is called when a data source instance is replaced or removed.
func (d *Datasource) Dispose() {
	if d.client != nil {
		d.client.invalidateDictionary()
	}
}

// ── QueryData ────────────────────────────────────────────────────────────────

// maxConcurrentQueries bounds how many panel targets run in parallel per
// request. The SDK caps this at 10.
const maxConcurrentQueries = 10

// QueryData handles multiple panel queries, executing each against the Kentik
// Query API concurrently and returning the resulting data frames.
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	return concurrent.QueryData(ctx, req, d.handleSingleQuery, maxConcurrentQueries)
}

func (d *Datasource) handleSingleQuery(ctx context.Context, q concurrent.Query) backend.DataResponse {
	return d.query(ctx, q.DataQuery)
}

func (d *Datasource) query(ctx context.Context, q backend.DataQuery) backend.DataResponse {
	var model queryModel
	var isLegacy bool

	// Legacy v2 shim: detect old TopXData query shape and translate it.
	if isLegacyQuery(q.JSON) {
		model = migrateLegacyQuery(q.JSON)
		isLegacy = true
	} else {
		if err := json.Unmarshal(q.JSON, &model); err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("invalid query: %v", err))
		}
	}

	// Skip queries that are not runnable (no measurement or no metrics).
	if model.Hide || model.Measurement == "" || len(model.metricList()) == 0 {
		return backend.DataResponse{}
	}

	windowSize := deriveWindowSize(model, q)

	payload, err := json.Marshal(buildExecuteRequest(model, q.TimeRange.From.UnixMilli(), q.TimeRange.To.UnixMilli(), windowSize))
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("failed to build query: %v", err))
	}

	body, status, err := d.client.execute(ctx, payload)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("UDE query failed for %s: %v", model.Measurement, err))
	}
	if status != http.StatusOK {
		return backend.ErrDataResponse(statusFromHTTP(status), formatUpstreamError(model, status, body))
	}

	var decoded executeResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("failed to decode response for %s: %v", model.Measurement, err))
	}

	frames, err := parseResults(decoded, model, d.client.settings.portalURL())
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("failed to parse results for %s: %v", model.Measurement, err))
	}

	// For legacy-shimmed queries, append a deprecation notice so the user sees
	// a warning and knows to re-save the panel in the new format.
	if isLegacy {
		frames = append(frames, legacyMigrationNotice())
	}

	return backend.DataResponse{Frames: frames}
}

// formatUpstreamError turns a non-200 Query API response into a user-facing
// message. Kentik returns HTTP 500 (gRPC code 13) for query/dimension/metric
// combinations it cannot run even though the dictionary advertises them; we
// translate that into actionable guidance rather than echoing raw JSON.
//
// When a cross-namespace mismatch is detected (e.g. a DNS metric with an SNMP
// dimension), the error message identifies the conflicting namespaces and
// suggests the universal equivalent of the incompatible field.
func formatUpstreamError(model queryModel, status int, body []byte) string {
	var apiErr struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(body, &apiErr)

	dims := model.dimensionList()
	mets := model.metricList()

	if status == http.StatusInternalServerError {
		// Detect cross-namespace mismatch: if the selected metrics and
		// dimensions come from different ktappprotocol namespaces, the Query API
		// cannot join them. Identify the conflict and suggest a fix.
		if hint := detectNamespaceMismatch(dims, mets); hint != "" {
			msg := fmt.Sprintf(
				"Kentik could not run this query on %q: %s",
				model.Measurement, hint,
			)
			if apiErr.Message != "" {
				msg += " Kentik: " + apiErr.Message
			}
			return msg
		}

		// Generic fallback.
		fields := make([]string, 0, len(dims)+len(mets))
		fields = append(fields, dims...)
		fields = append(fields, mets...)
		msg := fmt.Sprintf(
			"Kentik could not run this query on %q. This usually means one of the selected dimensions or metrics (%s) is not supported for this measurement. Try removing or swapping the most recently added field.",
			model.Measurement, strings.Join(fields, ", "),
		)
		if apiErr.Message != "" {
			msg += " Kentik: " + apiErr.Message
		}
		return msg
	}

	detail := apiErr.Message
	if detail == "" {
		detail = string(body)
	}
	return fmt.Sprintf("UDE query failed for %s: HTTP %d: %s", model.Measurement, status, detail)
}

// nsPrefix is the app-protocol namespace prefix in field keys.
const nsPrefix = "ktappprotocol__"

// extractNamespace returns the app-protocol namespace from a field key (e.g.
// "ktappprotocol__snmp__i_device_site_name" → "snmp"), or "" for universal
// (non-namespaced) fields.
func extractNamespace(key string) string {
	if !strings.HasPrefix(key, nsPrefix) {
		return ""
	}
	rest := key[len(nsPrefix):]
	idx := strings.Index(rest, "__")
	if idx < 0 {
		return ""
	}
	return rest[:idx]
}

// universalEquivalent strips the namespace prefix from a namespaced field and
// returns the universal key (e.g. "ktappprotocol__snmp__i_device_site_name" →
// "i_device_site_name"). Returns "" for non-namespaced fields.
func universalEquivalent(key string) string {
	if !strings.HasPrefix(key, nsPrefix) {
		return ""
	}
	rest := key[len(nsPrefix):]
	idx := strings.Index(rest, "__")
	if idx < 0 {
		return ""
	}
	return rest[idx+2:]
}

// detectNamespaceMismatch checks whether the selected metrics and dimensions
// contain a cross-namespace conflict, and returns a human-readable hint
// (including a suggestion to use the universal equivalent). Returns "" when no
// conflict is detected.
func detectNamespaceMismatch(dims, mets []string) string {
	// Collect the distinct metric namespaces.
	metNS := make(map[string]string) // namespace → example key
	for _, m := range mets {
		ns := extractNamespace(m)
		if ns != "" {
			metNS[ns] = m
		}
	}
	if len(metNS) == 0 {
		return "" // all metrics are universal — no conflict possible
	}

	// Check each dimension against the metric namespaces.
	for _, d := range dims {
		dNS := extractNamespace(d)
		if dNS == "" {
			continue // universal dimension — always compatible
		}
		// If the dimension namespace doesn't match any metric namespace, conflict.
		if _, ok := metNS[dNS]; !ok {
			// Find one metric namespace to cite in the message.
			var mNS, mKey string
			for ns, key := range metNS {
				mNS = ns
				mKey = key
				break
			}
			suggestion := ""
			if univ := universalEquivalent(d); univ != "" {
				suggestion = fmt.Sprintf(" Try using the universal %q instead.", univ)
			}
			return fmt.Sprintf(
				"Dimension %q is from the %q namespace, but your metric %q is from the %q namespace — these cannot be combined.%s",
				d, dNS, mKey, mNS, suggestion,
			)
		}
	}

	// Check reverse: metric namespace vs dimension namespaces.
	dimNS := make(map[string]string)
	for _, d := range dims {
		ns := extractNamespace(d)
		if ns != "" {
			dimNS[ns] = d
		}
	}
	for _, m := range mets {
		mNS := extractNamespace(m)
		if mNS == "" {
			continue
		}
		if _, ok := dimNS[mNS]; !ok && len(dimNS) > 0 {
			var dNS, dKey string
			for ns, key := range dimNS {
				dNS = ns
				dKey = key
				break
			}
			suggestion := ""
			if univ := universalEquivalent(dKey); univ != "" {
				suggestion = fmt.Sprintf(" Try using the universal %q instead of %q.", univ, dKey)
			}
			return fmt.Sprintf(
				"Metric %q is from the %q namespace, but your dimension %q is from the %q namespace — these cannot be combined.%s",
				m, mNS, dKey, dNS, suggestion,
			)
		}
	}

	return ""
}

// deriveWindowSize mirrors the frontend: prefer an explicit windowSize, else
// derive from the panel interval, with a 60s floor.
func deriveWindowSize(model queryModel, q backend.DataQuery) int {
	if model.WindowSize > 0 {
		return model.WindowSize
	}
	derived := int(q.Interval.Seconds())
	if derived < 60 {
		derived = 60
	}
	return derived
}

// ── CheckHealth ──────────────────────────────────────────────────────────────

// CheckHealth validates the configured credentials by calling the Site API,
// then reports the region and available measurement count.
func (d *Datasource) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if d.client.settings.Email == "" || d.client.settings.token == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Email and API token are required.",
		}, nil
	}

	status, body, err := d.client.getSites(ctx)
	if err != nil {
		log.DefaultLogger.Error("health check request failed", "error", err)
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Failed to connect to Kentik API.",
		}, nil
	}

	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Kentik rejected the configured email or API token.",
		}, nil
	case status != http.StatusOK:
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Kentik API returned HTTP %d.", status),
		}, nil
	case len(body) == 0:
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Connected but received an empty response from Kentik.",
		}, nil
	}

	// Credentials are valid. Enrich the message with region and measurement
	// count from the dictionary (best-effort — a failure here does not fail the
	// health check, since the connection itself is already confirmed).
	region := regionLabel(d.client.settings)
	if dict, derr := d.client.getDictionary(ctx); derr == nil {
		if count := countMeasurements(dict); count > 0 {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusOk,
				Message: fmt.Sprintf("Connected to Kentik (%s). %d measurements available.", region, count),
			}, nil
		}
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: fmt.Sprintf("Connected to Kentik (%s).", region),
	}, nil
}

// regionLabel returns a human-friendly region name for the health message.
func regionLabel(s dsSettings) string {
	switch strings.ToLower(s.Region) {
	case "eu":
		return "EU"
	case "custom":
		return "Custom"
	default:
		return "US"
	}
}

// countMeasurements counts the measurements in a raw dictionary payload.
func countMeasurements(body []byte) int {
	var doc struct {
		Measurements []json.RawMessage `json:"measurements"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return 0
	}
	return len(doc.Measurements)
}

// ── CallResource ─────────────────────────────────────────────────────────────

// CallResource exposes additional endpoints used by the query/config editor and
// for ad-hoc variable support (the cached dictionary).
func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	return d.resource.CallResource(ctx, req, sender)
}

func (d *Datasource) newResourceHandler() backend.CallResourceHandler {
	mux := http.NewServeMux()
	mux.HandleFunc("/dictionary", d.handleDictionary)
	mux.HandleFunc("/distinct", d.handleDistinct)
	return httpadapter.New(mux)
}

// handleDictionary serves the (cached) Kentik dictionary as raw JSON. The
// frontend normalizes the camelCase payload.
func (d *Datasource) handleDictionary(w http.ResponseWriter, r *http.Request) {
	data, err := d.client.getDictionary(r.Context())
	if err != nil {
		writeResourceError(w, http.StatusBadGateway, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// handleDistinct returns the distinct values of a dimension for a measurement,
// for dashboard "Query" variables. It runs a short-lookback execute query and
// collects the unique values of the requested dimension. This powers device /
// site / interface pickers that the dictionary does not enumerate.
//
// Query params:
//
//	measurement  (required) e.g. /metrics/system
//	dimension    (required) e.g. device_name
//	lookback     (optional) seconds, default 3600
//	limit        (optional) max distinct values, default 500
func (d *Datasource) handleDistinct(w http.ResponseWriter, r *http.Request) {
	measurement := r.URL.Query().Get("measurement")
	dimension := r.URL.Query().Get("dimension")
	if measurement == "" || dimension == "" {
		writeResourceError(w, http.StatusBadRequest, fmt.Errorf("measurement and dimension are required"))
		return
	}

	lookback := 3600
	if v := r.URL.Query().Get("lookback"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			lookback = n
		}
	}
	limit := 500
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	now := time.Now().Unix()
	// The Query API rejects a query with no metrics, so include the
	// measurement's first metric (the value is discarded — we only read the
	// dimension column).
	metric := d.firstMetricFor(r.Context(), measurement)
	metricsJSON := json.RawMessage(`[]`)
	var rollups []queryRollup
	if metric != "" {
		metricsJSON = json.RawMessage(`["` + metric + `"]`)
		rollups = []queryRollup{{Metric: metric, Fn: "avg"}}
	}
	model := queryModel{
		Measurement:     measurement,
		Dimensions:      json.RawMessage(`["` + dimension + `"]`),
		Metrics:         metricsJSON,
		FilterConnector: "All",
		Rollups:         rollups,
		Limit:           limit,
	}
	// Use a 1-dimension query; a window is still required.
	payload, err := json.Marshal(buildExecuteRequest(model, (now-int64(lookback))*1000, now*1000, lookback))
	if err != nil {
		writeResourceError(w, http.StatusInternalServerError, err)
		return
	}

	body, status, err := d.client.execute(r.Context(), payload)
	if err != nil {
		writeResourceError(w, http.StatusBadGateway, err)
		return
	}
	if status != http.StatusOK {
		writeResourceError(w, statusToHTTP(status), fmt.Errorf("kentik returned HTTP %d", status))
		return
	}

	var decoded executeResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		writeResourceError(w, http.StatusInternalServerError, err)
		return
	}

	values := distinctDimensionValues(decoded, dimension, limit)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(values)
}

// firstMetricFor returns the key of the first metric for a measurement, read
// from the cached dictionary (empty if unknown). Used to satisfy the Query
// API's "at least one metric" requirement when enumerating dimension values.
func (d *Datasource) firstMetricFor(ctx context.Context, measurement string) string {
	body, err := d.client.getDictionary(ctx)
	if err != nil {
		return ""
	}
	var doc struct {
		Measurements []struct {
			Name    string `json:"name"`
			Metrics []struct {
				Key string `json:"key"`
			} `json:"metrics"`
		} `json:"measurements"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return ""
	}
	for _, m := range doc.Measurements {
		if m.Name == measurement && len(m.Metrics) > 0 {
			return m.Metrics[0].Key
		}
	}
	return ""
}

// distinctDimensionValues extracts the unique, non-empty values of a dimension
// from an execute response, preserving first-seen order and capping at limit.
func distinctDimensionValues(resp executeResponse, dimension string, limit int) []string {
	if resp.Results == nil {
		return []string{}
	}
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, row := range resp.Results.Rows {
		v := cleanNodeID(row.Dimensions[dimension])
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
		if len(out) >= limit {
			break
		}
	}
	return out
}

// statusToHTTP maps an upstream status to an HTTP status for resource responses.
func statusToHTTP(httpStatus int) int {
	if httpStatus >= 400 && httpStatus < 500 {
		return http.StatusBadRequest
	}
	return http.StatusBadGateway
}

func writeResourceError(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

// statusFromHTTP maps an upstream HTTP status to an SDK error source status.
func statusFromHTTP(httpStatus int) backend.Status {
	if httpStatus >= 400 && httpStatus < 500 {
		return backend.StatusBadRequest
	}
	return backend.StatusInternal
}

// randHex returns a single random nibble (0-15) for request-id generation.
func randHex() int64 {
	return int64(rand.Intn(16))
}
