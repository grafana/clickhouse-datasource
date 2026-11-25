package plugin

import (
	"context"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/sqlds/v5"
)

const connectionIdleTTL = 5 * time.Minute

func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return newSQLDatasource(ctx, settings).NewDatasource(ctx, settings)
}

func newSQLDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) *sqlds.SQLDatasource {
	clickhousePlugin := Clickhouse{}
	ds := sqlds.NewDatasource(&clickhousePlugin)
	// Replace sqlds's default sqlutil.Interpolate pipeline with the
	// macropro-backed interpolator; see interpolateMacros in driver.go.
	ds.Interpolator = interpolateMacros
	// Always cap frame building at Grafana's dataproxy.row_limit (default
	// 1,000,000 rows). Without the cap, sqlds buffers an unbounded result set
	// in full and one oversized query can exhaust the plugin's memory. The
	// enableRowLimit datasource option remains separate: it additionally
	// pushes the same limit down to the ClickHouse server (driver.go).
	ds.EnableRowLimit = true
	pluginSettings := clickhousePlugin.Settings(ctx, settings)
	if pluginSettings.ForwardHeaders {
		ds.EnableMultipleConnections = true
		// sqlds opens one pool per forwarded header set, and the rotating identity token keeps adding new sets.
		ds.ConnectionCacheFactory = func() sqlds.ConnectionCache {
			return sqlds.NewIdleEvictingCache(connectionIdleTTL)
		}
	}

	return ds
}
