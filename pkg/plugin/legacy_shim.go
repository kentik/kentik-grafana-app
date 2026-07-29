package plugin

import (
	"encoding/json"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// legacyQuery is the shape of a v2.x TopXData saved query target. If we detect
// these fields, we translate the query to a UDE queryModel before execution.
type legacyQuery struct {
	Dimension      string `json:"dimension"`
	Metric         string `json:"metric"`
	Mode           string `json:"mode"`
	Devices        string `json:"devices"`
	HostnameLookup string `json:"hostnameLookup"`
	AliasBy        string `json:"aliasBy"`
	Prefix         string `json:"prefix"`
	QueryType      string `json:"queryType"`
}

// isLegacyQuery returns true if the raw JSON contains the old v2 query shape
// (has "dimension" or "metric" but no queryType, or queryType != "ude").
func isLegacyQuery(raw json.RawMessage) bool {
	var probe struct {
		QueryType   string `json:"queryType"`
		Dimension   string `json:"dimension"`
		Metric      string `json:"metric"`
		Measurement string `json:"measurement"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return false
	}
	// New UDE queries have queryType="ude" and a measurement.
	if probe.QueryType == "ude" || probe.Measurement != "" {
		return false
	}
	// Old queries have "dimension" and/or "metric" (singular).
	return probe.Dimension != "" || probe.Metric != ""
}

// migrateLegacyQuery translates a v2 saved query into the closest UDE
// queryModel. The translation is best-effort: v5 TopXData had features that
// don't map 1:1 to UDE (e.g. hostnameLookup, device groups), so some queries
// may not produce identical results.
func migrateLegacyQuery(raw json.RawMessage) queryModel {
	var lq legacyQuery
	_ = json.Unmarshal(raw, &lq)

	metric, fn := mapLegacyMetric(lq.Metric)

	dims := json.RawMessage(`[]`)
	if lq.Dimension != "" {
		dims, _ = json.Marshal([]string{lq.Dimension})
	}

	mets := json.RawMessage(`[]`)
	if metric != "" {
		mets, _ = json.Marshal([]string{metric})
	}

	var rollups []queryRollup
	if metric != "" && fn != "" {
		rollups = []queryRollup{{Metric: metric, Fn: fn}}
	}

	vizType := vizTypeLine
	if strings.EqualFold(lq.Mode, "table") {
		vizType = 12 // TABLE
	}

	// Build device filter if $devices was set.
	var filterGroups json.RawMessage
	if lq.Devices != "" && lq.Devices != "$devices" {
		// If it's a literal device name (not the variable itself), add a filter.
		fg := []map[string]interface{}{
			{
				"connector": "All",
				"not":       false,
				"filters": []map[string]string{
					{"filter_field": "i_device_name", "operator": "=", "filter_value": lq.Devices},
				},
			},
		}
		filterGroups, _ = json.Marshal(fg)
	}

	return queryModel{
		Measurement:     "/traffic",
		Dimensions:      dims,
		Metrics:         mets,
		Rollups:         rollups,
		VizType:         vizType,
		Limit:           8,
		AliasBy:         lq.AliasBy,
		Prefix:          lq.Prefix,
		FilterGroups:    filterGroups,
		FilterConnector: "All",
	}
}

// mapLegacyMetric converts a v2 metric value (e.g. "avg_bits_per_sec",
// "p95th_pkts_per_sec") into the UDE metric key + rollup function.
func mapLegacyMetric(v2Metric string) (udeMetric, fn string) {
	if v2Metric == "" {
		return "both_bits_per_sec", "avg"
	}

	// Extract the function prefix.
	lower := strings.ToLower(v2Metric)
	switch {
	case strings.HasPrefix(lower, "avg_"):
		fn = "avg"
		lower = lower[4:]
	case strings.HasPrefix(lower, "p95th_"):
		fn = "p95"
		lower = lower[6:]
	case strings.HasPrefix(lower, "p99th_"):
		fn = "p99"
		lower = lower[6:]
	case strings.HasPrefix(lower, "max_"):
		fn = "max"
		lower = lower[4:]
	default:
		fn = "avg"
	}

	// Map the base metric to UDE key.
	switch {
	case strings.Contains(lower, "bits_per_sec"):
		udeMetric = "both_bits_per_sec"
	case strings.Contains(lower, "pkts_per_sec") || strings.Contains(lower, "packets"):
		udeMetric = "both_pkts_per_sec"
	case strings.Contains(lower, "flows_per_sec"):
		udeMetric = "fps"
	case strings.Contains(lower, "src_ip"):
		udeMetric = "unique_src_ip"
	case strings.Contains(lower, "dst_ip"):
		udeMetric = "unique_dst_ip"
	case strings.Contains(lower, "bytes_per_src_ip"):
		udeMetric = "bytes_per_src_ip"
	case strings.Contains(lower, "bytes_per_dst_ip"):
		udeMetric = "bytes_per_dst_ip"
	case strings.HasPrefix(v2Metric, "ktappprotocol__") ||
		strings.HasPrefix(v2Metric, "avg_ktappprotocol__") ||
		strings.HasPrefix(v2Metric, "p95th_ktappprotocol__") ||
		strings.HasPrefix(v2Metric, "p99th_ktappprotocol__") ||
		strings.HasPrefix(v2Metric, "max_ktappprotocol__"):
		// App-protocol metrics: strip the function prefix and use original case.
		udeMetric = v2Metric
		for _, pfx := range []string{"avg_", "p95th_", "p99th_", "max_"} {
			if strings.HasPrefix(udeMetric, pfx) {
				udeMetric = udeMetric[len(pfx):]
				break
			}
		}
	default:
		// Best effort: pass through as-is.
		udeMetric = lower
	}

	return udeMetric, fn
}

// legacyMigrationNotice returns a data frame carrying a Grafana Notice that
// tells the user their panel uses the deprecated v2 query format.
func legacyMigrationNotice() *data.Frame {
	notice := data.NewFrame("_notice")
	notice.Meta = &data.FrameMeta{
		Notices: []data.Notice{
			{
				Severity: data.NoticeSeverityWarning,
				Text:     "This panel uses the deprecated v2 query format. Please edit and re-save to upgrade to the new UDE format. The legacy shim will be removed in a future version.",
			},
		},
	}
	return notice
}
