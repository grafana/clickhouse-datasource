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

	schemaProvider := NewSchemaProvider(&clickhousePlugin, settings)
	clickhousePlugin.SchemaDatasource = schemas.NewSchemaDatasource(
		schemaProvider,
		schemaProvider,
		schemaProvider,
		nil,
		schemaProvider,
		nil,
	)

	inst, err := ds.NewDatasource(ctx, settings)
	if err != nil {
		return nil, err
	}

	ds = inst.(*sqlds.SQLDatasource)
	clickhousePlugin.SchemaDatasource.CallResourceHandler = ds.CallResourceHandler // save the original handler
	ds.CallResourceHandler = backend.CallResourceHandlerFunc(func(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
		return clickhousePlugin.SchemaDatasource.CallResource(ctx, req, sender)
	})

	return ds, nil
}
