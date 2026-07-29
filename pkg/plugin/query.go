package plugin

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// VizType values mirror the VizType enum in ude_query_builder.ts.
const (
	vizTypeLine = 3
)

var (
	tagPattern       = regexp.MustCompile(`\$tag_([a-zA-Z0-9_.]+)`)
	mustachePattern  = regexp.MustCompile(`\{\{([a-zA-Z0-9_.\s-]+)\}\}`)
	colPattern       = regexp.MustCompile(`\$col`)
	metricGrpPattern = regexp.MustCompile(`\$metric_group`)
	metricPattern    = regexp.MustCompile(`\$metric`)
)

// buildExecuteRequest constructs an ExecuteQueryRequest payload from a Grafana
// query model and the resolved time range / window. Ported from
// buildExecuteQueryRequest in ude_query_builder.ts.
func buildExecuteRequest(q queryModel, fromMs, toMs int64, windowSize int) executeRequest {
	dimNames := q.dimensionList()
	metNames := q.metricList()

	dimensions := make([]queryDimension, 0, len(dimNames))
	for _, name := range dimNames {
		d := queryDimension{Name: name}
		if q.Cidr > 0 {
			d.Cidr = q.Cidr
		}
		if q.Cidr6 > 0 {
			d.Cidr6 = q.Cidr6
		}
		dimensions = append(dimensions, d)
	}

	metrics := make([]queryMetric, 0, len(metNames))
	for _, name := range metNames {
		metrics = append(metrics, queryMetric{Name: name})
	}

	vizType := q.VizType
	if vizType == 0 {
		vizType = vizTypeLine
	}
	limit := q.Limit
	if limit == 0 {
		limit = 8
	}

	ude := udeQuery{
		Measurement: q.Measurement,
		Dimensions:  dimensions,
		Metrics:     metrics,
		Time: queryTimeRange{
			Lookback: 0,
			Start:    fromMs / 1000,
			End:      toMs / 1000,
		},
		Viz: queryViz{Type: vizType, Limit: limit},
	}

	// Filters: pass nested filter groups through unchanged.
	if len(q.FilterGroups) > 0 && !isEmptyJSONArray(q.FilterGroups) {
		connector := q.FilterConnector
		if connector == "" {
			connector = "All"
		}
		ude.Filters = &queryFilters{
			Dimensions: &filtersBlock{
				Connector:    connector,
				FilterGroups: q.FilterGroups,
			},
		}
	}

	// Window — always set; the Query API returns HTTP 500 without window.size.
	if windowSize > 0 {
		ude.Window = &queryWindow{Size: windowSize}
	}

	if len(q.Rollups) > 0 {
		ude.Rollups = q.Rollups
	}

	if q.SortBy != "" {
		order := q.SortOrder
		if order == "" {
			order = "desc"
		}
		ude.Sort = []querySort{{Rollup: q.SortBy, Order: order}}
	}

	if q.Limit > 0 {
		ude.Limit = q.Limit
	}

	return executeRequest{
		Query: ude,
		ApplicationMetadata: map[string]interface{}{
			"name":    "kentik-grafana-plugin",
			"context": "panel-query",
		},
		RequestID: generateRequestID(),
	}
}

func isEmptyJSONArray(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s == "" || s == "[]" || s == "null"
}

// parseResults converts a decoded Query API response into Grafana data frames.
// Ported from DataSource.parseResults in DataSource.ts. portalURL, when set, is
// attached to value fields as an "Open in Kentik" data link.
func parseResults(resp executeResponse, q queryModel, portalURL string) ([]*data.Frame, error) {
	if resp.Results == nil {
		return nil, nil
	}

	results := resp.Results

	timestamps := make([]time.Time, 0, len(results.Timestamps))
	for _, ts := range results.Timestamps {
		// Timestamps are string epoch-seconds.
		secs, err := strconv.ParseFloat(ts.String(), 64)
		if err != nil {
			return nil, fmt.Errorf("parse timestamp %q: %w", ts.String(), err)
		}
		timestamps = append(timestamps, time.UnixMilli(int64(secs*1000)).UTC())
	}

	if len(timestamps) == 0 && len(results.Rows) == 0 {
		return nil, nil
	}

	dimKeys := q.dimensionList()
	metricKeys := q.metricList()

	// "nodegraph" format builds a node-graph (nodes + edges) from a query with
	// two dimensions (source, target) and at least one metric.
	if strings.EqualFold(q.Format, "nodegraph") && len(results.Rows) > 0 {
		return parseNodeGraph(results.Rows, dimKeys, metricKeys), nil
	}

	// "table" format reduces each series to a single row (mean over the range),
	// producing one frame with dimension columns + metric columns. This is the
	// shape map lookups and bar/table panels consume directly.
	if strings.EqualFold(q.Format, "table") && len(results.Rows) > 0 {
		return parseInstantTable(results.Rows, dimKeys, metricKeys), nil
	}

	if len(timestamps) > 0 {
		return parseTimeSeries(results.Rows, timestamps, q, dimKeys, portalURL), nil
	}
	return parseTable(results.Rows, dimKeys, metricKeys, portalURL), nil
}

// openInKentikLink returns the "Open in Kentik" data link config for a value
// field, or nil when no portal URL is configured.
func openInKentikLink(portalURL string) []data.DataLink {
	if portalURL == "" {
		return nil
	}
	return []data.DataLink{{
		Title:       "Open in Kentik",
		URL:         strings.TrimRight(portalURL, "/") + "/v4/core/explorer",
		TargetBlank: true,
	}}
}

func parseTimeSeries(rows []executeRow, timestamps []time.Time, q queryModel, dimKeys []string, portalURL string) []*data.Frame {
	var frames []*data.Frame
	links := openInKentikLink(portalURL)

	for _, row := range rows {
		dimensionLabel := buildSeriesLabel(row.Dimensions, dimKeys)

		// Expose each selected dimension as a field label so panels can recover
		// the raw dimension values (e.g. a "Labels to fields" transform feeding a
		// Geomap country lookup) and so legends can template on {{dimension}}.
		var labels data.Labels
		if len(dimKeys) > 0 {
			labels = make(data.Labels, len(dimKeys))
			for _, key := range dimKeys {
				if v, ok := row.Dimensions[key]; ok {
					labels[key] = v
				}
			}
		}

		for metricName, rawValues := range row.Values {
			fallback := metricName
			if dimensionLabel != "" {
				fallback = dimensionLabel + " - " + metricName
			}

			seriesName := fallback
			if q.AliasBy != "" || q.Prefix != "" {
				if alias := applyAlias(row.Dimensions, metricName, q, dimKeys); alias != "" {
					seriesName = alias
				}
			}

			values := coerceValues(rawValues, len(timestamps))

			valueField := data.NewField(metricName, labels, values)
			// Pin the display name so Grafana uses exactly the computed series
			// name instead of concatenating frame name + field name + labels
			// (which would render e.g. "US US US").
			valueField.Config = &data.FieldConfig{DisplayNameFromDS: seriesName}
			if links != nil {
				valueField.Config.Links = links
			}

			frame := data.NewFrame(seriesName,
				data.NewField("time", nil, append([]time.Time(nil), timestamps...)),
				valueField,
			)
			frames = append(frames, frame)
		}
	}

	return frames
}

func parseTable(rows []executeRow, dimKeys, metricKeys []string, portalURL string) []*data.Frame {
	links := openInKentikLink(portalURL)
	dimColumns := make([][]string, len(dimKeys))
	for i := range dimColumns {
		dimColumns[i] = make([]string, 0, len(rows))
	}
	metricColumns := make([][]float64, len(metricKeys))
	for i := range metricColumns {
		metricColumns[i] = make([]float64, 0, len(rows))
	}

	for _, row := range rows {
		for i, key := range dimKeys {
			dimColumns[i] = append(dimColumns[i], row.Dimensions[key])
		}
		for i, key := range metricKeys {
			metricColumns[i] = append(metricColumns[i], numberOrZero(row.Rollups[key]))
		}
	}

	fields := make([]*data.Field, 0, len(dimKeys)+len(metricKeys))
	for i, key := range dimKeys {
		fields = append(fields, data.NewField(key, nil, dimColumns[i]))
	}
	for i, key := range metricKeys {
		metricField := data.NewField(key, nil, metricColumns[i])
		if links != nil {
			metricField.Config = &data.FieldConfig{Links: links}
		}
		fields = append(fields, metricField)
	}

	return []*data.Frame{data.NewFrame("", fields...)}
}

// parseInstantTable reduces a time-series execute response to a single table
// frame: one row per series, with the selected dimension columns plus one mean
// value column per metric. This is the shape Geomap lookups and bar/table
// panels consume directly (no client-side transforms required).
func parseInstantTable(rows []executeRow, dimKeys, metricKeys []string) []*data.Frame {
	dimColumns := make([][]string, len(dimKeys))
	for i := range dimColumns {
		dimColumns[i] = make([]string, 0, len(rows))
	}
	metricColumns := make([][]float64, len(metricKeys))
	for i := range metricColumns {
		metricColumns[i] = make([]float64, 0, len(rows))
	}

	for _, row := range rows {
		for i, key := range dimKeys {
			dimColumns[i] = append(dimColumns[i], row.Dimensions[key])
		}
		for i, key := range metricKeys {
			metricColumns[i] = append(metricColumns[i], meanOfValues(row.Values[key]))
		}
	}

	fields := make([]*data.Field, 0, len(dimKeys)+len(metricKeys))
	for i, key := range dimKeys {
		fields = append(fields, data.NewField(key, nil, dimColumns[i]))
	}
	for i, key := range metricKeys {
		// When there's a single metric, use "value" as the column name so panels
		// that reference a fixed field name (e.g. geomap layer size/color) work
		// regardless of which metric a variable resolved to.
		name := key
		if len(metricKeys) == 1 {
			name = "value"
		}
		fields = append(fields, data.NewField(name, nil, metricColumns[i]))
	}

	return []*data.Frame{data.NewFrame("", fields...)}
}

// meanOfValues returns the average of a metric's value series, ignoring the
// array length (used by the reduced table format).
func meanOfValues(raw json.RawMessage) float64 {
	vals := coerceValues(raw, 0)
	if len(vals) == 0 {
		return 0
	}
	var sum float64
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

// parseNodeGraph builds Grafana node-graph frames (nodes + edges) from a query
// with two dimensions (source, target) and at least one metric. The first
// metric drives edge weight and node throughput; a second metric, when present,
// becomes the edge/node secondary stat (e.g. errors). Rows whose source or
// target is blank/unknown ("" or "-"/"---") are skipped so the graph stays
// readable.
func parseNodeGraph(rows []executeRow, dimKeys, metricKeys []string) []*data.Frame {
	if len(dimKeys) < 2 || len(metricKeys) < 1 {
		// Not enough structure for a graph; fall back to a flat table.
		return parseInstantTable(rows, dimKeys, metricKeys)
	}

	srcKey, dstKey := dimKeys[0], dimKeys[1]
	primary := metricKeys[0]
	var secondary string
	if len(metricKeys) > 1 {
		secondary = metricKeys[1]
	}

	type nodeAgg struct {
		total float64
		sec   float64
	}
	nodeOrder := make([]string, 0)
	nodes := make(map[string]*nodeAgg)
	ensure := func(id string) *nodeAgg {
		n, ok := nodes[id]
		if !ok {
			n = &nodeAgg{}
			nodes[id] = n
			nodeOrder = append(nodeOrder, id)
		}
		return n
	}

	var (
		edgeIDs, edgeSrc, edgeDst []string
		edgeMain, edgeSecondary   []float64
	)

	for _, row := range rows {
		src := cleanNodeID(row.Dimensions[srcKey])
		dst := cleanNodeID(row.Dimensions[dstKey])
		if src == "" || dst == "" {
			continue
		}
		val := meanOfValues(row.Values[primary])
		var secVal float64
		if secondary != "" {
			secVal = meanOfValues(row.Values[secondary])
		}

		sn := ensure(src)
		sn.total += val
		sn.sec += secVal
		dn := ensure(dst)
		dn.total += val
		dn.sec += secVal

		edgeIDs = append(edgeIDs, src+"->"+dst)
		edgeSrc = append(edgeSrc, src)
		edgeDst = append(edgeDst, dst)
		edgeMain = append(edgeMain, val)
		edgeSecondary = append(edgeSecondary, secVal)
	}

	// Nodes frame.
	nodeID := make([]string, 0, len(nodeOrder))
	nodeTitle := make([]string, 0, len(nodeOrder))
	nodeMain := make([]string, 0, len(nodeOrder))
	for _, id := range nodeOrder {
		nodeID = append(nodeID, id)
		nodeTitle = append(nodeTitle, id)
		nodeMain = append(nodeMain, formatBitsPerSec(nodes[id].total))
	}

	edgeMainStr := make([]string, len(edgeMain))
	for i, v := range edgeMain {
		edgeMainStr[i] = formatBitsPerSec(v)
	}

	nodeFields := []*data.Field{
		data.NewField("id", nil, nodeID),
		data.NewField("title", nil, nodeTitle),
		data.NewField("mainStat", nil, nodeMain),
	}
	edgeFields := []*data.Field{
		data.NewField("id", nil, edgeIDs),
		data.NewField("source", nil, edgeSrc),
		data.NewField("target", nil, edgeDst),
		data.NewField("mainStat", nil, edgeMainStr),
	}
	// Only expose a secondary stat when a second metric was requested,
	// otherwise the panel renders a meaningless "0.00".
	if secondary != "" {
		nodeSecStr := make([]string, len(nodeOrder))
		for i, id := range nodeOrder {
			nodeSecStr[i] = formatCount(nodes[id].sec)
		}
		edgeSecStr := make([]string, len(edgeSecondary))
		for i, v := range edgeSecondary {
			edgeSecStr[i] = formatCount(v)
		}
		nodeFields = append(nodeFields, data.NewField("secondaryStat", nil, nodeSecStr))
		edgeFields = append(edgeFields, data.NewField("secondaryStat", nil, edgeSecStr))
	}

	nodesFrame := data.NewFrame("nodes", nodeFields...)
	nodesFrame.Meta = &data.FrameMeta{PreferredVisualization: data.VisTypeNodeGraph}

	edgesFrame := data.NewFrame("edges", edgeFields...)
	edgesFrame.Meta = &data.FrameMeta{PreferredVisualization: data.VisTypeNodeGraph}

	return []*data.Frame{nodesFrame, edgesFrame}
}

// cleanNodeID trims a dimension value and treats Kentik's "unknown" markers
// ("-", "---") as empty so they can be skipped.
func cleanNodeID(v string) string {
	v = strings.TrimSpace(v)
	if v == "-" || v == "---" {
		return ""
	}
	return v
}

// formatBitsPerSec renders a bits/second value as a compact human-readable
// string (e.g. "8.52 Gb/s"). The node-graph panel displays large numeric stats
// raw, so the backend pre-formats them into the node/edge mainStat.
func formatBitsPerSec(v float64) string {
	units := []string{"b/s", "kb/s", "Mb/s", "Gb/s", "Tb/s", "Pb/s"}
	i := 0
	for v >= 1000 && i < len(units)-1 {
		v /= 1000
		i++
	}
	return strconv.FormatFloat(v, 'f', 2, 64) + " " + units[i]
}

// formatCount renders a plain count (e.g. error packets) compactly.
func formatCount(v float64) string {
	units := []string{"", "K", "M", "B"}
	i := 0
	for v >= 1000 && i < len(units)-1 {
		v /= 1000
		i++
	}
	if i == 0 {
		return strconv.FormatFloat(v, 'f', 0, 64)
	}
	return strconv.FormatFloat(v, 'f', 2, 64) + units[i]
}

// buildSeriesLabel joins the dimension values in declaration order.
func buildSeriesLabel(dimensions map[string]string, dimKeys []string) string {
	parts := make([]string, 0, len(dimKeys))
	for _, key := range dimKeys {
		if v, ok := dimensions[key]; ok && v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, ", ")
}

// applyAlias resolves the configured aliasBy/prefix template against a series'
// dimensions and metric name. Grafana dashboard variables in aliasBy/prefix are
// expected to be interpolated frontend-side via applyTemplateVariables before
// the query reaches the backend. Ported from DataSource.applyAlias.
func applyAlias(dimensions map[string]string, metricName string, q queryModel, dimKeys []string) string {
	aliasBy := q.AliasBy
	prefix := q.Prefix

	replaceTag := func(tagName string) string {
		if v, ok := dimensions[tagName]; ok {
			return v
		}
		lower := strings.ToLower(tagName)
		for k, v := range dimensions {
			if strings.ToLower(k) == lower {
				return v
			}
		}
		return ""
	}

	var result string
	if aliasBy == "" {
		dimLabel := buildSeriesLabel(dimensions, dimKeys)
		suffix := ""
		if metricName != "" {
			suffix = " (" + metricName + ")"
		}
		if prefix != "" {
			result = prefix + " " + dimLabel + suffix
		} else {
			result = dimLabel + suffix
		}
	} else if prefix != "" {
		result = prefix + " " + aliasBy
	} else {
		result = aliasBy
	}

	result = tagPattern.ReplaceAllStringFunc(result, func(match string) string {
		name := tagPattern.FindStringSubmatch(match)[1]
		if v := replaceTag(name); v != "" {
			return v
		}
		return match
	})
	result = mustachePattern.ReplaceAllStringFunc(result, func(match string) string {
		name := strings.TrimSpace(mustachePattern.FindStringSubmatch(match)[1])
		if v := replaceTag(name); v != "" {
			return v
		}
		return match
	})
	result = metricGrpPattern.ReplaceAllString(result, metricName)
	result = colPattern.ReplaceAllString(result, metricName)
	result = metricPattern.ReplaceAllString(result, metricName)

	return result
}

// coerceValues mirrors DataSource.coerceValues: accepts an array of numbers, an
// object with a `values` array, or a scalar broadcast across all timestamps.
func coerceValues(raw json.RawMessage, length int) []float64 {
	if len(raw) == 0 {
		return make([]float64, length)
	}

	var arr []json.Number
	if err := json.Unmarshal(raw, &arr); err == nil {
		out := make([]float64, len(arr))
		for i, n := range arr {
			out[i] = numberOrZero(n)
		}
		return out
	}

	var obj struct {
		Values []json.Number `json:"values"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && obj.Values != nil {
		out := make([]float64, len(obj.Values))
		for i, n := range obj.Values {
			out[i] = numberOrZero(n)
		}
		return out
	}

	var scalar json.Number
	if err := json.Unmarshal(raw, &scalar); err == nil {
		v := numberOrZero(scalar)
		out := make([]float64, length)
		for i := range out {
			out[i] = v
		}
		return out
	}

	return make([]float64, length)
}

func numberOrZero(n json.Number) float64 {
	if n == "" {
		return 0
	}
	f, err := n.Float64()
	if err != nil {
		return 0
	}
	return f
}

// generateRequestID returns a RFC-4122-ish v4 UUID string, matching the format
// produced by generateRequestId in ude_query_builder.ts.
func generateRequestID() string {
	const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
	var b strings.Builder
	b.Grow(len(template))
	for _, c := range template {
		switch c {
		case 'x':
			b.WriteString(strconv.FormatInt(randHex(), 16))
		case 'y':
			b.WriteString(strconv.FormatInt((randHex()&0x3)|0x8, 16))
		default:
			b.WriteRune(c)
		}
	}
	return b.String()
}
