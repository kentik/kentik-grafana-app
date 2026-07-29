package plugin

import (
	"encoding/json"
	"testing"
)

func TestIsLegacyQuery(t *testing.T) {
	cases := []struct {
		desc string
		raw  string
		want bool
	}{
		{"new UDE query", `{"queryType":"ude","measurement":"/traffic","metrics":["both_bits_per_sec"]}`, false},
		{"old v2 query", `{"dimension":"src_geo","metric":"avg_bits_per_sec","mode":"graph"}`, true},
		{"old with empty queryType", `{"queryType":"","dimension":"dst_geo","metric":"avg_pkts_per_sec"}`, true},
		{"empty object", `{}`, false},
		{"new query without queryType but with measurement", `{"measurement":"/traffic","metrics":["x"]}`, false},
	}
	for _, c := range cases {
		t.Run(c.desc, func(t *testing.T) {
			if got := isLegacyQuery(json.RawMessage(c.raw)); got != c.want {
				t.Errorf("isLegacyQuery(%s) = %v, want %v", c.raw, got, c.want)
			}
		})
	}
}

func TestMigrateLegacyQuery(t *testing.T) {
	raw := json.RawMessage(`{"dimension":"src_geo","metric":"avg_bits_per_sec","mode":"graph","aliasBy":"{{src_geo}}"}`)
	model := migrateLegacyQuery(raw)

	if model.Measurement != "/traffic" {
		t.Errorf("measurement = %q, want /traffic", model.Measurement)
	}
	dims := model.dimensionList()
	if len(dims) != 1 || dims[0] != "src_geo" {
		t.Errorf("dimensions = %v, want [src_geo]", dims)
	}
	mets := model.metricList()
	if len(mets) != 1 || mets[0] != "both_bits_per_sec" {
		t.Errorf("metrics = %v, want [both_bits_per_sec]", mets)
	}
	if len(model.Rollups) != 1 || model.Rollups[0].Fn != "avg" {
		t.Errorf("rollups = %+v, want [{both_bits_per_sec avg}]", model.Rollups)
	}
	if model.AliasBy != "{{src_geo}}" {
		t.Errorf("aliasBy = %q, want {{src_geo}}", model.AliasBy)
	}
}

func TestMapLegacyMetric(t *testing.T) {
	cases := []struct {
		in     string
		metric string
		fn     string
	}{
		{"avg_bits_per_sec", "both_bits_per_sec", "avg"},
		{"p95th_bits_per_sec", "both_bits_per_sec", "p95"},
		{"max_pkts_per_sec", "both_pkts_per_sec", "max"},
		{"avg_flows_per_sec", "fps", "avg"},
		{"", "both_bits_per_sec", "avg"},
		{"avg_ktappprotocol__snmp__INT05", "ktappprotocol__snmp__INT05", "avg"},
	}
	for _, c := range cases {
		m, fn := mapLegacyMetric(c.in)
		if m != c.metric || fn != c.fn {
			t.Errorf("mapLegacyMetric(%q) = (%q,%q), want (%q,%q)", c.in, m, fn, c.metric, c.fn)
		}
	}
}
