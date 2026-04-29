package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	schemas "github.com/grafana/schemads"
	"github.com/grafana/sqlds/v5"
)

func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	clickhousePlugin := Clickhouse{}
	ds := sqlds.NewDatasource(&clickhousePlugin)
	pluginSettings := clickhousePlugin.Settings(ctx, settings)
	if pluginSettings.ForwardHeaders {
		ds.EnableMultipleConnections = true
	}

	schemaProvider := NewSchemaProvider(ctx, &clickhousePlugin, settings)
	ds.ResourceMiddleware = func(next backend.CallResourceHandler) backend.CallResourceHandler {
		return schemas.NewSchemaDatasource(
			schemaProvider,
			schemaProvider,
			schemaProvider,
			nil, // no table parameter values handler
			schemaProvider,
			next,
		)
	}

	return ds.NewDatasource(ctx, settings)
}
