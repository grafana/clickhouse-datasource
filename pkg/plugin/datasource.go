package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/sqlds/v5"
)

// Datasource wraps the sqlds datasource so request headers can be adjusted
// before sqlds reads them. sqlds copies the forwarded headers out of the
// request before it calls any driver hook (MutateQueryData included), so a
// header added from a hook never reaches ClickHouse.
type Datasource struct {
	*sqlds.SQLDatasource
}

// QueryData adds X-Grafana-User to the request headers, then delegates to sqlds.
func (ds *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	injectGrafanaUserHeader(ctx, req)
	return ds.SQLDatasource.QueryData(ctx, req)
}

func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
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
	}

	instance, err := ds.NewDatasource(ctx, settings)
	if err != nil {
		return nil, err
	}
	return &Datasource{SQLDatasource: instance.(*sqlds.SQLDatasource)}, nil
}
