package plugin

import (
	"encoding/json"
	"net/url"
	"strings"
)

// ── Data source configuration ───────────────────────────────────────────────

// kentikURL mirrors the frontend `jsonData.url` object, holding the gRPC-gateway
// (v6) base URL and the REST (v5) base URL.
type kentikURL struct {
	V6 string `json:"v6"`
	V5 string `json:"v5"`
}

// dsSettings is the decoded representation of a data source instance's
// configuration (jsonData + the decrypted API token).
type dsSettings struct {
	URL        kentikURL `json:"url"`
	Email      string    `json:"email"`
	Region     string    `json:"region"`
	DynamicURL string    `json:"dynamicUrl"`
	Timeout    int       `json:"timeout"`

	token string
}

// baseURL returns the v6 (gRPC-gateway) base URL, falling back to a
// region-derived default when jsonData.url has not been populated yet.
func (s dsSettings) baseURL() string {
	v6 := strings.TrimRight(s.URL.V6, "/")
	if v6 != "" {
		return v6
	}
	switch strings.ToLower(s.Region) {
	case "eu":
		return "https://grpc.api.kentik.eu"
	case "custom":
		return strings.TrimRight(s.DynamicURL, "/")
	default:
		return "https://grpc.api.kentik.com"
	}
}

// portalURL derives the Kentik portal base URL (origin only, no path) from the
// configured region / API URLs, mirroring the prior frontend derivePortalUrl:
//   - default → https://portal.kentik.com
//   - eu      → https://portal.kentik.eu
//   - custom  → derived from the API host by replacing an `api.` / `grpc.api.`
//     prefix with `portal.` (hosts without that prefix are returned unchanged).
func (s dsSettings) portalURL() string {
	switch strings.ToLower(s.Region) {
	case "eu":
		return "https://portal.kentik.eu"
	case "custom":
		apiURL := s.DynamicURL
		if apiURL == "" {
			apiURL = s.URL.V5
		}
		if apiURL == "" {
			apiURL = s.URL.V6
		}
		if apiURL == "" {
			return "https://portal.kentik.com"
		}
		parsed, err := url.Parse(apiURL)
		if err != nil || parsed.Host == "" {
			return "https://portal.kentik.com"
		}
		host := parsed.Hostname()
		switch {
		case strings.HasPrefix(host, "grpc.api."):
			parsed.Host = "portal." + strings.TrimPrefix(host, "grpc.api.")
		case strings.HasPrefix(host, "api."):
			parsed.Host = "portal." + strings.TrimPrefix(host, "api.")
		}
		scheme := parsed.Scheme
		if scheme == "" {
			scheme = "https"
		}
		return scheme + "://" + parsed.Host
	default:
		return "https://portal.kentik.com"
	}
}

// loadSettings decodes the raw jsonData and decrypted secrets into dsSettings.
func loadSettings(jsonData json.RawMessage, token string) (dsSettings, error) {
	var s dsSettings
	if len(jsonData) > 0 {
		if err := json.Unmarshal(jsonData, &s); err != nil {
			return s, err
		}
	}
	s.token = token
	return s, nil
}

// ── Grafana query model (mirrors src/datasource/ude_types.ts) ────────────────

type queryRollup struct {
	Metric string `json:"metric"`
	Fn     string `json:"fn"`
}

// queryModel is the per-panel query as stored by Grafana and sent to the backend.
type queryModel struct {
	Measurement     string          `json:"measurement"`
	Dimensions      json.RawMessage `json:"dimensions"`
	Metrics         json.RawMessage `json:"metrics"`
	AliasBy         string          `json:"aliasBy"`
	Prefix          string          `json:"prefix"`
	FilterGroups    json.RawMessage `json:"filterGroups"`
	FilterConnector string          `json:"filterConnector"`
	VizType         int             `json:"vizType"`
	Limit           int             `json:"limit"`
	WindowSize      int             `json:"windowSize"`
	Rollups         []queryRollup   `json:"rollups"`
	SortBy          string          `json:"sortBy"`
	SortOrder       string          `json:"sortOrder"`
	Cidr            int             `json:"cidr"`
	Cidr6           int             `json:"cidr6"`
	Hide            bool            `json:"hide"`

	// Format optionally controls the frame shape. "table" reduces each series to
	// a single row (one row per dimension combination, value = mean over the
	// range), which suits map lookups and bar/table panels. Empty = time series.
	Format string `json:"format"`
}

// dimensionList / metricList resolve the dimensions/metrics fields, which may be
// stored either as a list of strings or a list of objects ({name}/{value}).
func (q queryModel) dimensionList() []string { return toStringList(q.Dimensions) }
func (q queryModel) metricList() []string    { return toStringList(q.Metrics) }

// toStringList mirrors normalizeFieldList/normalizeStringList in the TS code: it
// accepts a JSON array of strings or of objects with a `name`/`value` field.
func toStringList(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}

	var strs []string
	if err := json.Unmarshal(raw, &strs); err == nil {
		out := make([]string, 0, len(strs))
		for _, s := range strs {
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	}

	var objs []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &objs); err == nil {
		out := make([]string, 0, len(objs))
		for _, o := range objs {
			switch {
			case o.Name != "":
				out = append(out, o.Name)
			case o.Value != "":
				out = append(out, o.Value)
			}
		}
		return out
	}

	// Single string value.
	var single string
	if err := json.Unmarshal(raw, &single); err == nil && single != "" {
		return []string{single}
	}

	return nil
}

// ── Kentik Query API request types (mirror ude_query_builder.ts) ─────────────

type queryDimension struct {
	Name  string `json:"name"`
	Cidr  int    `json:"cidr,omitempty"`
	Cidr6 int    `json:"cidr6,omitempty"`
}

type queryMetric struct {
	Name string `json:"name"`
}

type queryTimeRange struct {
	Lookback int   `json:"lookback"`
	Start    int64 `json:"start"`
	End      int64 `json:"end"`
}

type queryWindow struct {
	Size int `json:"size"`
}

type queryViz struct {
	Type  int `json:"type"`
	Limit int `json:"limit"`
}

type querySort struct {
	Rollup string `json:"rollup"`
	Order  string `json:"order,omitempty"`
}

// filtersBlock and queryFilters preserve the snake_case filter group shape the
// Query API expects; the nested filter groups are passed through untouched.
type filtersBlock struct {
	Connector    string          `json:"connector"`
	FilterGroups json.RawMessage `json:"filter_groups"`
}

type queryFilters struct {
	Dimensions *filtersBlock `json:"dimensions,omitempty"`
}

type udeQuery struct {
	Measurement string           `json:"measurement"`
	Dimensions  []queryDimension `json:"dimensions"`
	Metrics     []queryMetric    `json:"metrics"`
	Filters     *queryFilters    `json:"filters,omitempty"`
	Time        queryTimeRange   `json:"time"`
	Window      *queryWindow     `json:"window,omitempty"`
	Rollups     []queryRollup    `json:"rollups,omitempty"`
	Sort        []querySort      `json:"sort,omitempty"`
	Viz         queryViz         `json:"viz"`
	Limit       int              `json:"limit,omitempty"`
}

type executeRequest struct {
	Query               udeQuery               `json:"query"`
	ApplicationMetadata map[string]interface{} `json:"application_metadata"`
	RequestID           string                 `json:"request_id"`
}

// ── Kentik Query API response types ──────────────────────────────────────────

type executeRow struct {
	Dimensions map[string]string          `json:"dimensions"`
	Values     map[string]json.RawMessage `json:"values"`
	Rollups    map[string]json.Number     `json:"rollups"`
}

type executeResults struct {
	Timestamps []json.Number `json:"timestamps"`
	Rows       []executeRow  `json:"rows"`
}

type executeResponse struct {
	Results *executeResults `json:"results"`
}
