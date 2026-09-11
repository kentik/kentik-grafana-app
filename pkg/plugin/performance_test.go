package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestDashboardLoadPerformance measures the concrete scenario reported by a
// customer (Tesla): a dashboard with many panels, opened by several people at
// roughly the same time, against an upstream API with realistic latency.
//
// It compares two paths against an identical simulated Kentik API (each
// request takes upstreamLatency to answer):
//   - "uncoalesced" — bypasses the dedup cache (c.doRequest directly), i.e.
//     the pre-fix behavior where every panel query from every user hits
//     upstream independently.
//   - "coalesced" — the shipped path (c.execute), which shares one upstream
//     call across identical concurrent/near-concurrent queries.
//
// Payloads are built via the real buildExecuteRequest/json.Marshal path (not
// hand-crafted literals), so each one carries its own fresh, distinct
// request_id exactly like real panel queries — this is what actually proves
// the coalescing engages in production, since a naive full-payload cache key
// would never match across independently-generated request_ids.
//
// Only the upstream call *counts* are asserted (deterministic). Elapsed time
// is logged for visibility but intentionally not asserted on: wall-clock
// comparisons under time.Sleep are prone to flake on loaded/shared CI
// runners, and the call-count assertions alone already prove the fix works.
func TestDashboardLoadPerformance(t *testing.T) {
	const (
		panelsPerDashboard = 15 // matches the reported dashboard size
		concurrentUsers    = 5  // several people opening the dashboard at once
		upstreamLatency    = 50 * time.Millisecond
		upstreamCapacity   = 10 // simulates the Kentik API's bounded concurrency/rate limit
	)

	model := newQueryModel(t, `{
		"measurement": "flow",
		"dimensions": ["src_addr"],
		"metrics": ["bytes"],
		"filterConnector": "All",
		"vizType": 3,
		"limit": 8
	}`)

	runLoad := func(t *testing.T, exec func(ctx context.Context, c *kentikClient, payload []byte) error) (time.Duration, int32) {
		t.Helper()
		var calls int32
		sem := make(chan struct{}, upstreamCapacity)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sem <- struct{}{} // block once upstreamCapacity requests are in flight, like a rate-limited API
			defer func() { <-sem }()
			atomic.AddInt32(&calls, 1)
			time.Sleep(upstreamLatency)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"results":[]}`))
		}))
		defer srv.Close()

		c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)

		// panelsPerDashboard distinct queries (one per simulated panel), each
		// rebuilt independently per simulated user so every payload carries its
		// own fresh request_id — mirroring N users loading the same dashboard.
		payloadsPerUser := make([][][]byte, concurrentUsers)
		for u := range payloadsPerUser {
			payloadsPerUser[u] = make([][]byte, panelsPerDashboard)
			for i := range payloadsPerUser[u] {
				panelModel := model
				panelModel.Measurement = fmt.Sprintf("/traffic/panel-%d", i)
				req := buildExecuteRequest(panelModel, 1000, 2000, 60)
				b, err := json.Marshal(req)
				if err != nil {
					t.Fatalf("marshal executeRequest: %v", err)
				}
				payloadsPerUser[u][i] = b
			}
		}

		start := time.Now()
		var wg sync.WaitGroup
		for u := 0; u < concurrentUsers; u++ {
			for _, payload := range payloadsPerUser[u] {
				wg.Add(1)
				go func(payload []byte) {
					defer wg.Done()
					if err := exec(context.Background(), c, payload); err != nil {
						t.Errorf("query error: %v", err)
					}
				}(payload)
			}
		}
		wg.Wait()
		elapsed := time.Since(start)

		return elapsed, atomic.LoadInt32(&calls)
	}

	uncoalescedElapsed, uncoalescedCalls := runLoad(t, func(ctx context.Context, c *kentikClient, payload []byte) error {
		_, _, err := c.doRequest(ctx, http.MethodPost, pathQuery, payload)
		return err
	})

	coalescedElapsed, coalescedCalls := runLoad(t, func(ctx context.Context, c *kentikClient, payload []byte) error {
		_, _, err := c.execute(ctx, payload)
		return err
	})

	t.Logf("dashboard load: %d panels x %d concurrent users", panelsPerDashboard, concurrentUsers)
	t.Logf("  before (uncoalesced): %d upstream calls, rendered in %s", uncoalescedCalls, uncoalescedElapsed)
	t.Logf("  after  (coalesced):   %d upstream calls, rendered in %s", coalescedCalls, coalescedElapsed)

	if int(uncoalescedCalls) != panelsPerDashboard*concurrentUsers {
		t.Errorf("uncoalesced calls = %d, want %d (every panel query should hit upstream independently)",
			uncoalescedCalls, panelsPerDashboard*concurrentUsers)
	}
	if int(coalescedCalls) != panelsPerDashboard {
		t.Errorf("coalesced calls = %d, want %d (identical concurrent queries across users should share one upstream call)",
			coalescedCalls, panelsPerDashboard)
	}

	if coalescedElapsed >= uncoalescedElapsed {
		t.Logf("NOTE: coalesced (%s) was not faster than uncoalesced (%s) on this run — informational only, not a failure", coalescedElapsed, uncoalescedElapsed)
	}
}
