package plugin

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func newQueryModel(t *testing.T, raw string) queryModel {
	t.Helper()
	var m queryModel
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("unmarshal query model: %v", err)
	}
	return m
}

func TestBuildExecuteRequest(t *testing.T) {
	m := newQueryModel(t, `{
		"measurement": "flow",
		"dimensions": ["src_addr"],
		"metrics": ["bytes"],
		"filterConnector": "All",
		"vizType": 3,
		"limit": 8
	}`)

	fromMs := int64(1700000000000)
	toMs := int64(1700000120000)
	req := buildExecuteRequest(m, fromMs, toMs, 60)

	if req.Query.Measurement != "flow" {
		t.Errorf("measurement = %q, want flow", req.Query.Measurement)
	}
	if len(req.Query.Dimensions) != 1 || req.Query.Dimensions[0].Name != "src_addr" {
		t.Errorf("dimensions = %+v", req.Query.Dimensions)
	}
	if len(req.Query.Metrics) != 1 || req.Query.Metrics[0].Name != "bytes" {
		t.Errorf("metrics = %+v", req.Query.Metrics)
	}
	if req.Query.Time.Start != 1700000000 || req.Query.Time.End != 1700000120 {
		t.Errorf("time = %+v, want start=1700000000 end=1700000120", req.Query.Time)
	}
	if req.Query.Window == nil || req.Query.Window.Size != 60 {
		t.Errorf("window must be set with size 60, got %+v", req.Query.Window)
	}
	if req.Query.Viz.Type != vizTypeLine || req.Query.Viz.Limit != 8 {
		t.Errorf("viz = %+v", req.Query.Viz)
	}
	if req.RequestID == "" {
		t.Error("request_id must not be empty")
	}
}

func TestBuildExecuteRequestDefaults(t *testing.T) {
	m := newQueryModel(t, `{"measurement": "flow", "metrics": ["bytes"]}`)
	req := buildExecuteRequest(m, 1000, 2000, 0)

	if req.Query.Viz.Type != vizTypeLine {
		t.Errorf("default viz type = %d, want %d", req.Query.Viz.Type, vizTypeLine)
	}
	if req.Query.Viz.Limit != 8 {
		t.Errorf("default viz limit = %d, want 8", req.Query.Viz.Limit)
	}
	if req.Query.Window != nil {
		t.Errorf("window should be nil when size is 0, got %+v", req.Query.Window)
	}
}

func TestBuildExecuteRequestFilters(t *testing.T) {
	m := newQueryModel(t, `{
		"measurement": "flow",
		"metrics": ["bytes"],
		"filterConnector": "Any",
		"filterGroups": [{"connector":"All","not":false,"filters":[{"filter_field":"src_addr","operator":"=","filter_value":"10.0.0.1"}]}]
	}`)
	req := buildExecuteRequest(m, 1000, 2000, 60)

	if req.Query.Filters == nil || req.Query.Filters.Dimensions == nil {
		t.Fatalf("filters not set: %+v", req.Query.Filters)
	}
	if req.Query.Filters.Dimensions.Connector != "Any" {
		t.Errorf("connector = %q, want Any", req.Query.Filters.Dimensions.Connector)
	}
}

func TestBuildExecuteRequestEmptyFilters(t *testing.T) {
	m := newQueryModel(t, `{"measurement":"flow","metrics":["bytes"],"filterGroups":[]}`)
	req := buildExecuteRequest(m, 1000, 2000, 60)
	if req.Query.Filters != nil {
		t.Errorf("empty filterGroups must not set filters, got %+v", req.Query.Filters)
	}
}

func TestToStringList(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{`["a","b"]`, []string{"a", "b"}},
		{`[{"name":"a"},{"value":"b"}]`, []string{"a", "b"}},
		{`"single"`, []string{"single"}},
		{`[]`, nil},
		{`["a","",""]`, []string{"a"}},
	}
	for _, c := range cases {
		got := toStringList(json.RawMessage(c.in))
		if len(got) != len(c.want) {
			t.Errorf("toStringList(%s) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("toStringList(%s)[%d] = %q, want %q", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestParseResultsTimeSeries(t *testing.T) {
	body := `{
		"results": {
			"timestamps": ["1700000000", "1700000060", "1700000120"],
			"rows": [
				{"dimensions": {"src_addr": "10.0.0.1"}, "values": {"bytes": [100, 200, 300]}, "rollups": {"bytes": 600}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	m := newQueryModel(t, `{"measurement":"flow","dimensions":["src_addr"],"metrics":["bytes"]}`)
	frames, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if len(frames) != 1 {
		t.Fatalf("frames = %d, want 1", len(frames))
	}
	frame := frames[0]
	if len(frame.Fields) != 2 {
		t.Fatalf("fields = %d, want 2", len(frame.Fields))
	}
	if frame.Fields[0].Name != "time" {
		t.Errorf("field[0] name = %q, want time", frame.Fields[0].Name)
	}
	// The value field is named for the metric; the series display name is pinned
	// via DisplayNameFromDS to avoid frame/field/label concatenation.
	if frame.Fields[1].Name != "bytes" {
		t.Errorf("field[1] name = %q, want 'bytes'", frame.Fields[1].Name)
	}
	if frame.Fields[1].Config == nil || frame.Fields[1].Config.DisplayNameFromDS != "10.0.0.1 - bytes" {
		t.Errorf("field[1] display name = %+v, want '10.0.0.1 - bytes'", frame.Fields[1].Config)
	}
	if frame.Fields[1].Len() != 3 {
		t.Errorf("values len = %d, want 3", frame.Fields[1].Len())
	}
	wantFirst := time.UnixMilli(1700000000000).UTC()
	if got := frame.Fields[0].At(0).(time.Time); !got.Equal(wantFirst) {
		t.Errorf("first timestamp = %v, want %v", got, wantFirst)
	}
	if got := frame.Fields[1].At(0).(float64); got != 100 {
		t.Errorf("first value = %v, want 100", got)
	}
	// Selected dimensions are exposed as field labels for transforms/geomaps.
	if got := frame.Fields[1].Labels["src_addr"]; got != "10.0.0.1" {
		t.Errorf("value field label src_addr = %q, want 10.0.0.1", got)
	}
}

func TestParseResultsTable(t *testing.T) {
	body := `{
		"results": {
			"timestamps": [],
			"rows": [
				{"dimensions": {"src_addr": "10.0.0.1"}, "rollups": {"bytes": 600}},
				{"dimensions": {"src_addr": "10.0.0.2"}, "rollups": {"bytes": 700}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	m := newQueryModel(t, `{"measurement":"flow","dimensions":["src_addr"],"metrics":["bytes"]}`)
	frames, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if len(frames) != 1 {
		t.Fatalf("frames = %d, want 1", len(frames))
	}
	frame := frames[0]
	if len(frame.Fields) != 2 {
		t.Fatalf("fields = %d, want 2", len(frame.Fields))
	}
	if frame.Fields[0].Len() != 2 {
		t.Errorf("rows = %d, want 2", frame.Fields[0].Len())
	}
	if got := frame.Fields[1].At(1).(float64); got != 700 {
		t.Errorf("second bytes = %v, want 700", got)
	}
}

func TestParseResultsInstantTable(t *testing.T) {
	body := `{
		"results": {
			"timestamps": ["1700000000", "1700000060", "1700000120"],
			"rows": [
				{"dimensions": {"dst_geo": "US"}, "values": {"bps": [100, 200, 300]}},
				{"dimensions": {"dst_geo": "KR"}, "values": {"bps": [10, 20, 30]}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	m := newQueryModel(t, `{"measurement":"/traffic","dimensions":["dst_geo"],"metrics":["bps"],"format":"table"}`)
	frames, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if len(frames) != 1 {
		t.Fatalf("frames = %d, want 1 (single table frame)", len(frames))
	}
	frame := frames[0]
	if len(frame.Fields) != 2 {
		t.Fatalf("fields = %d, want 2 (dst_geo, bps)", len(frame.Fields))
	}
	if frame.Fields[0].Name != "dst_geo" || frame.Fields[1].Name != "value" {
		t.Errorf("field names = %q,%q, want dst_geo,value (single metric → 'value')", frame.Fields[0].Name, frame.Fields[1].Name)
	}
	if frame.Fields[0].Len() != 2 {
		t.Errorf("rows = %d, want 2", frame.Fields[0].Len())
	}
	// Mean of [100,200,300] = 200.
	if got := frame.Fields[1].At(0).(float64); got != 200 {
		t.Errorf("US mean = %v, want 200", got)
	}
	if got := frame.Fields[0].At(0).(string); got != "US" {
		t.Errorf("first country = %q, want US", got)
	}
}

func TestParseResultsNodeGraph(t *testing.T) {
	body := `{
		"results": {
			"timestamps": ["1700000000", "1700000060"],
			"rows": [
				{"dimensions": {"src_geo": "US", "dst_geo": "DE"}, "values": {"bps": [100, 200]}},
				{"dimensions": {"src_geo": "US", "dst_geo": "JP"}, "values": {"bps": [50, 50]}},
				{"dimensions": {"src_geo": "-", "dst_geo": "DE"}, "values": {"bps": [999, 999]}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	m := newQueryModel(t, `{"measurement":"/traffic","dimensions":["src_geo","dst_geo"],"metrics":["bps"],"format":"nodegraph"}`)
	frames, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if len(frames) != 2 {
		t.Fatalf("frames = %d, want 2 (nodes + edges)", len(frames))
	}
	nodes, edges := frames[0], frames[1]
	if nodes.Name != "nodes" || edges.Name != "edges" {
		t.Fatalf("frame names = %q,%q want nodes,edges", nodes.Name, edges.Name)
	}
	if nodes.Meta == nil || nodes.Meta.PreferredVisualization != data.VisTypeNodeGraph {
		t.Errorf("nodes frame missing nodeGraph visualization meta")
	}
	// The "-"/unknown source row is skipped, so its edge is dropped.
	if edges.Fields[0].Len() != 2 {
		t.Errorf("edges = %d, want 2 (unknown src skipped)", edges.Fields[0].Len())
	}
	// Nodes: US, DE, JP (unknown "-" skipped).
	if nodes.Fields[0].Len() != 3 {
		t.Errorf("nodes = %d, want 3 (US, DE, JP)", nodes.Fields[0].Len())
	}
	// Single metric → no secondaryStat field.
	wantEdgeFields := []string{"id", "source", "target", "mainStat"}
	if len(edges.Fields) != len(wantEdgeFields) {
		t.Fatalf("edge fields = %d, want %d (no secondaryStat for single metric)", len(edges.Fields), len(wantEdgeFields))
	}
	for i, name := range wantEdgeFields {
		if edges.Fields[i].Name != name {
			t.Errorf("edge field[%d] = %q, want %q", i, edges.Fields[i].Name, name)
		}
	}
}

func TestParseResultsNodeGraphSecondaryStat(t *testing.T) {
	body := `{
		"results": {
			"timestamps": ["1700000000"],
			"rows": [
				{"dimensions": {"src_geo": "US", "dst_geo": "DE"}, "values": {"bps": [100], "errs": [5]}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	m := newQueryModel(t, `{"measurement":"/traffic","dimensions":["src_geo","dst_geo"],"metrics":["bps","errs"],"format":"nodegraph"}`)
	frames, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	edges := frames[1]
	// Two metrics → secondaryStat present.
	if len(edges.Fields) != 5 || edges.Fields[4].Name != "secondaryStat" {
		t.Fatalf("expected secondaryStat edge field with two metrics, got %d fields", len(edges.Fields))
	}
}

func TestParseResultsEmpty(t *testing.T) {
	var resp executeResponse
	frames, err := parseResults(resp, queryModel{}, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if frames != nil {
		t.Errorf("expected nil frames, got %+v", frames)
	}
}

func TestApplyAlias(t *testing.T) {
	dims := map[string]string{"src_addr": "10.0.0.1"}
	m := queryModel{AliasBy: "$tag_src_addr ($metric)"}
	got := applyAlias(dims, "bytes", m, []string{"src_addr"})
	if got != "10.0.0.1 (bytes)" {
		t.Errorf("applyAlias = %q, want '10.0.0.1 (bytes)'", got)
	}

	m2 := queryModel{Prefix: "PFX"}
	got2 := applyAlias(dims, "bytes", m2, []string{"src_addr"})
	if got2 != "PFX 10.0.0.1 (bytes)" {
		t.Errorf("applyAlias prefix = %q, want 'PFX 10.0.0.1 (bytes)'", got2)
	}
}

func TestCoerceValues(t *testing.T) {
	if got := coerceValues(json.RawMessage(`[1,2,3]`), 3); len(got) != 3 || got[2] != 3 {
		t.Errorf("array coerce = %v", got)
	}
	if got := coerceValues(json.RawMessage(`{"values":[4,5]}`), 2); len(got) != 2 || got[0] != 4 {
		t.Errorf("object coerce = %v", got)
	}
	if got := coerceValues(json.RawMessage(`7`), 3); len(got) != 3 || got[0] != 7 || got[2] != 7 {
		t.Errorf("scalar coerce = %v", got)
	}
	if got := coerceValues(json.RawMessage(``), 2); len(got) != 2 {
		t.Errorf("empty coerce = %v", got)
	}
}

func TestDeriveWindowSize(t *testing.T) {
	if got := deriveWindowSize(queryModel{WindowSize: 300}, backend.DataQuery{}); got != 300 {
		t.Errorf("explicit window = %d, want 300", got)
	}
	if got := deriveWindowSize(queryModel{}, backend.DataQuery{Interval: 120 * time.Second}); got != 120 {
		t.Errorf("derived window = %d, want 120", got)
	}
	if got := deriveWindowSize(queryModel{}, backend.DataQuery{Interval: 5 * time.Second}); got != 60 {
		t.Errorf("floored window = %d, want 60", got)
	}
}

func TestBaseURL(t *testing.T) {
	cases := []struct {
		settings dsSettings
		want     string
	}{
		{dsSettings{URL: kentikURL{V6: "https://grpc.api.kentik.com"}}, "https://grpc.api.kentik.com"},
		{dsSettings{URL: kentikURL{V6: "https://grpc.api.kentik.com/"}}, "https://grpc.api.kentik.com"},
		{dsSettings{Region: "eu"}, "https://grpc.api.kentik.eu"},
		{dsSettings{Region: "custom", DynamicURL: "https://grpc.api.example.com/"}, "https://grpc.api.example.com"},
		{dsSettings{}, "https://grpc.api.kentik.com"},
	}
	for _, c := range cases {
		if got := c.settings.baseURL(); got != c.want {
			t.Errorf("baseURL(%+v) = %q, want %q", c.settings, got, c.want)
		}
	}
}

func TestPortalURL(t *testing.T) {
	cases := []struct {
		settings dsSettings
		want     string
	}{
		{dsSettings{Region: "default"}, "https://portal.kentik.com"},
		{dsSettings{}, "https://portal.kentik.com"},
		{dsSettings{Region: "eu"}, "https://portal.kentik.eu"},
		{dsSettings{Region: "custom", DynamicURL: "https://grpc.api.acme.com"}, "https://portal.acme.com"},
		{dsSettings{Region: "custom", DynamicURL: "https://api.acme.com"}, "https://portal.acme.com"},
		{dsSettings{Region: "custom", URL: kentikURL{V5: "https://api.acme.io"}}, "https://portal.acme.io"},
		{dsSettings{Region: "custom", DynamicURL: "https://kentik.internal"}, "https://kentik.internal"},
		{dsSettings{Region: "custom"}, "https://portal.kentik.com"},
	}
	for _, c := range cases {
		if got := c.settings.portalURL(); got != c.want {
			t.Errorf("portalURL(%+v) = %q, want %q", c.settings, got, c.want)
		}
	}
}

func TestParseResultsAddsOpenInKentikLink(t *testing.T) {
	body := `{
		"results": {
			"timestamps": ["1700000000", "1700000060"],
			"rows": [
				{"dimensions": {"src_addr": "10.0.0.1"}, "values": {"bytes": [100, 200]}}
			]
		}
	}`
	var resp executeResponse
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	m := newQueryModel(t, `{"measurement":"flow","dimensions":["src_addr"],"metrics":["bytes"]}`)

	// With a portal URL, the value field carries the data link.
	frames, err := parseResults(resp, m, "https://portal.kentik.com")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	valueField := frames[0].Fields[1]
	if valueField.Config == nil || len(valueField.Config.Links) != 1 {
		t.Fatalf("expected one data link, got %+v", valueField.Config)
	}
	link := valueField.Config.Links[0]
	if link.Title != "Open in Kentik" {
		t.Errorf("link title = %q", link.Title)
	}
	if link.URL != "https://portal.kentik.com/v4/core/explorer" {
		t.Errorf("link url = %q", link.URL)
	}
	if !link.TargetBlank {
		t.Error("link should open in a new tab")
	}

	// Without a portal URL, no link is attached.
	noLink, err := parseResults(resp, m, "")
	if err != nil {
		t.Fatalf("parseResults: %v", err)
	}
	if cfg := noLink[0].Fields[1].Config; cfg != nil && len(cfg.Links) != 0 {
		t.Errorf("expected no links without portal URL, got %+v", cfg.Links)
	}
}
