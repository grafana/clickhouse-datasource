package schemacache

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

// simulatedRoundTrip mimics the latency profile of a ClickHouse system.tables
// query as seen from a MT api-server Pod. 2ms is roughly the observed floor
// for intra-cluster queries (read_rows in the low thousands, no scan). The
// test doesn't care about the exact number — it just needs something large
// enough that the cache path is measurably cheaper than the upstream path,
// while being small enough that benchmarks finish in a reasonable time.
const simulatedRoundTrip = 2 * time.Millisecond

var sinkStrings []string

func fetchSimulated(ctx context.Context) ([]string, error) {
	time.Sleep(simulatedRoundTrip)
	// Return a non-trivial payload so the benchmark reflects real allocation
	// patterns (short-form hit shouldn't be free purely because V is a zero).
	return []string{"default.events", "default.logs", "default.traces"}, nil
}

// BenchmarkTablesFetch_Uncached measures the cost of calling fetchSimulated
// directly — the baseline before the cache. Every call pays simulatedRoundTrip.
func BenchmarkTablesFetch_Uncached(b *testing.B) {
	ctx := context.Background()
	b.ReportAllocs()
	for b.Loop() {
		v, err := fetchSimulated(ctx)
		if err != nil {
			b.Fatal(err)
		}
		sinkStrings = v
	}
}

// BenchmarkTablesFetch_Cached measures the same call path wrapped in the
// cache. The first iteration incurs simulatedRoundTrip; all subsequent
// iterations should be cache hits — so ns/op is expected to drop by ~3 orders
// of magnitude (from ~2ms to a few hundred ns) and allocs/op to near zero.
func BenchmarkTablesFetch_Cached(b *testing.B) {
	ctx := context.Background()
	c := New[[]string](time.Hour, 0, 4)
	b.ReportAllocs()
	for b.Loop() {
		v, err := c.Do(ctx, "all", fetchSimulated)
		if err != nil {
			b.Fatal(err)
		}
		sinkStrings = v
	}
}

// BenchmarkTablesFetch_CachedConcurrent is the shape that actually motivated
// the cache: a 20-panel dashboard opens and fires 20 parallel schema resource
// calls. Without singleflight every cold caller would pay simulatedRoundTrip
// independently; with it, exactly one does and the other 19 block on the
// shared result.
func BenchmarkTablesFetch_CachedConcurrent(b *testing.B) {
	ctx := context.Background()
	const panels = 20

	b.ReportAllocs()
	i := 0
	for b.Loop() {
		// Fresh cache per outer iteration so every iteration pays the singleflight
		// cost and we're not just measuring hot-cache hits. The singleflight
		// behavior — collapsing concurrent misses — is the thing under test.
		c := New[[]string](time.Hour, 0, 4)
		var wg sync.WaitGroup
		wg.Add(panels)
		iter := i
		for range panels {
			go func() {
				defer wg.Done()
				v, err := c.Do(ctx, fmt.Sprintf("iter-%d", iter), fetchSimulated)
				if err != nil {
					b.Error(err)
					return
				}
				sinkStrings = v
			}()
		}
		wg.Wait()
		i++
	}
}
