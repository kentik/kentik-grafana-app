package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestExecuteCoalescesConcurrentIdenticalQueries proves the fix for
// dashboards with many panels causing duplicate upstream calls: N concurrent
// calls to execute() with the exact same payload must reach the Kentik API
// only once, with every caller receiving the shared result.
func TestExecuteCoalescesConcurrentIdenticalQueries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[{"bucket":"a"}]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	const concurrency = 15 // simulates 15 panels/users issuing the same query at once
	var wg sync.WaitGroup
	errs := make(chan error, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, status, err := c.execute(context.Background(), payload)
			if err != nil {
				errs <- err
				return
			}
			if status != http.StatusOK {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("execute() error: %v", err)
	}

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("upstream calls = %d, want 1 (concurrent identical queries should coalesce)", got)
	}
}

// TestExecuteDoesNotCoalesceDistinctQueries proves distinct panel queries
// (the normal case) are unaffected — each still reaches the upstream API.
func TestExecuteDoesNotCoalesceDistinctQueries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			payload := []byte(`{"query":{"measurement":"/traffic","n":` + string(rune('0'+n)) + `}}`)
			if _, _, err := c.execute(context.Background(), payload); err != nil {
				t.Errorf("execute() error: %v", err)
			}
		}(i)
	}
	wg.Wait()

	if got := atomic.LoadInt32(&calls); got != 5 {
		t.Errorf("upstream calls = %d, want 5 (distinct queries must not be deduped)", got)
	}
}

// TestExecuteServesCacheOnSequentialIdenticalQueries proves the short-lived
// result cache serves a second identical call (issued after the first
// completes, e.g. a second user opening the same dashboard moments later)
// without a repeat upstream request.
func TestExecuteServesCacheOnSequentialIdenticalQueries(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("first execute() error: %v", err)
	}
	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("second execute() error: %v", err)
	}

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("upstream calls = %d, want 1 (second identical call within TTL should hit cache)", got)
	}
}

// TestExecuteCoalescesRealBuildExecuteRequestPayloads is the critical
// regression test for the bug where buildExecuteRequest stamps every payload
// with a fresh crypto/rand request_id: hashing the *full* payload for the
// cache/coalescing key would make two calls for the identical query (e.g. two
// users loading the same dashboard) never match, silently defeating the whole
// feature while still passing tests built on hand-crafted identical payloads.
// This test goes through the real production path (buildExecuteRequest ->
// json.Marshal -> execute()) with two independently-generated request_ids for
// what is otherwise the exact same query, and asserts they still coalesce.
func TestExecuteCoalescesRealBuildExecuteRequestPayloads(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)

	model := newQueryModel(t, `{
		"measurement": "flow",
		"dimensions": ["src_addr"],
		"metrics": ["bytes"],
		"filterConnector": "All",
		"vizType": 3,
		"limit": 8
	}`)

	buildPayload := func() []byte {
		req := buildExecuteRequest(model, 1000, 2000, 60)
		if req.RequestID == "" {
			t.Fatal("buildExecuteRequest did not set a request_id")
		}
		b, err := json.Marshal(req)
		if err != nil {
			t.Fatalf("marshal executeRequest: %v", err)
		}
		return b
	}

	// Two independently-built payloads for the identical query — each carries
	// its own fresh, distinct request_id, exactly like two different users'
	// browsers issuing the same panel query at the same moment.
	payloadA := buildPayload()
	payloadB := buildPayload()
	if string(payloadA) == string(payloadB) {
		t.Fatal("test setup invalid: payloads must differ only by request_id")
	}

	var wg sync.WaitGroup
	for _, payload := range [][]byte{payloadA, payloadB} {
		wg.Add(1)
		go func(payload []byte) {
			defer wg.Done()
			if _, _, err := c.execute(context.Background(), payload); err != nil {
				t.Errorf("execute() error: %v", err)
			}
		}(payload)
	}
	wg.Wait()

	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("upstream calls = %d, want 1 (identical query with different request_ids must still coalesce)", got)
	}
}

// TestExecuteTTLExpiryRefetches proves a cached result is not served forever:
// after queryCacheTTL elapses, an identical call must reach upstream again.
func TestExecuteTTLExpiryRefetches(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("first execute() error: %v", err)
	}

	time.Sleep(queryCacheTTL + 50*time.Millisecond)

	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("second execute() error: %v", err)
	}

	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Errorf("upstream calls = %d, want 2 (call after TTL expiry must refetch, not serve stale cache)", got)
	}
}

// TestExecuteDoesNotCacheErrorStatus proves a non-200 response is never
// cached: a subsequent identical call must still reach upstream rather than
// replay the failed response for the rest of the TTL window.
func TestExecuteDoesNotCacheErrorStatus(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	if _, status, err := c.execute(context.Background(), payload); err != nil || status != http.StatusInternalServerError {
		t.Fatalf("first execute() = (status=%d, err=%v), want (500, nil)", status, err)
	}
	if _, status, err := c.execute(context.Background(), payload); err != nil || status != http.StatusInternalServerError {
		t.Fatalf("second execute() = (status=%d, err=%v), want (500, nil)", status, err)
	}

	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Errorf("upstream calls = %d, want 2 (error responses must not be cached)", got)
	}
}

// TestExecuteDoesNotCacheMalformedOKResponse proves a 200 response with an
// invalid/truncated body is not cached, so a transient upstream glitch isn't
// replayed to every subsequent caller for the rest of the TTL window.
func TestExecuteDoesNotCacheMalformedOKResponse(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
		if n == 1 {
			_, _ = w.Write([]byte(`{"results": [truncated`)) // malformed
		} else {
			_, _ = w.Write([]byte(`{"results":[]}`)) // well-formed
		}
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("first execute() error: %v", err)
	}
	if _, _, err := c.execute(context.Background(), payload); err != nil {
		t.Fatalf("second execute() error: %v", err)
	}

	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Errorf("upstream calls = %d, want 2 (malformed 200 body must not be cached)", got)
	}
}

// TestExecuteFollowerContextCancellationIsolated proves that one caller
// canceling its own context does not fail a concurrent, unrelated caller
// coalesced onto the same query key — e.g. one user's tab closing must not
// break another user's dashboard load for the identical panel.
func TestExecuteFollowerContextCancellationIsolated(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release // hold the response until the test lets it through
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	c := newKentikClient(dsSettings{URL: kentikURL{V6: srv.URL}, Email: "e", token: "t"}, http.DefaultClient)
	payload := []byte(`{"query":{"measurement":"/traffic"}}`)

	cancelCtx, cancel := context.WithCancel(context.Background())
	healthyDone := make(chan error, 1)
	cancelDone := make(chan error, 1)

	// Healthy caller starts first so it becomes the singleflight leader.
	go func() {
		_, _, err := c.execute(context.Background(), payload)
		healthyDone <- err
	}()
	// Give the leader a moment to register the in-flight call before the
	// second caller joins as a follower on the same key.
	time.Sleep(20 * time.Millisecond)
	go func() {
		_, _, err := c.execute(cancelCtx, payload)
		cancelDone <- err
	}()
	time.Sleep(20 * time.Millisecond)

	cancel() // the follower gives up on its own request
	if err := <-cancelDone; err == nil {
		t.Error("canceled caller expected a context error, got nil")
	}

	close(release) // let the shared upstream call complete
	if err := <-healthyDone; err != nil {
		t.Errorf("unrelated healthy caller sharing the same key failed: %v (its own ctx was never canceled)", err)
	}
}
