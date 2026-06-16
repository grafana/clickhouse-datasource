package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	schemas "github.com/grafana/schemads"
	"github.com/grafana/sqlds/v5"
)

// clickhouseInstance wraps the sqlds-managed instance so its Dispose also
// closes the SchemaProvider's shared *sql.DB. Embedding *sqlds.SQLDatasource
// promotes every handler method (QueryData, CheckHealth, CallResource, …) so
// type assertions on instancemgmt.Instance keep working unchanged.
type clickhouseInstance struct {
	*sqlds.SQLDatasource
	schema *SchemaProvider
}

func (i *clickhouseInstance) Dispose() {
	i.SQLDatasource.Dispose()
	if err := i.schema.Close(); err != nil {
		backend.Logger.Error("failed to close schema provider", "error", err)
	}
}

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

	inst, err := ds.NewDatasource(ctx, settings)
	if err != nil {
		return nil, err
	}
	sqlInst, ok := inst.(*sqlds.SQLDatasource)
	if !ok {
		// Defensive: if sqlds ever returns a different concrete type we can't
		// embed it cleanly. Fall back to the unwrapped instance — the schema
		// DB will then leak on settings change but the plugin still works.
		return inst, nil
	}
	return &clickhouseInstance{SQLDatasource: sqlInst, schema: schemaProvider}, nil
}
