package plugin

import (
	"context"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	schemas "github.com/grafana/schemads"
)

func TestSchemaResourceOptions(t *testing.T) {
	ttlOverride := schemas.DefaultOptions
	ttlOverride.TTL.FullSchema = 120 * time.Second
	ttlOverride.TTL.Tables = 120 * time.Second
	ttlOverride.TTL.Columns = 120 * time.Second

	tests := []struct {
		name     string
		settings Settings
		want     schemas.Options
	}{
		{
			name:     "cache disabled turns off response caching",
			settings: Settings{EnableSchemaCache: false, SchemaCacheTTLSeconds: 60},
			want:     schemas.Options{DisableCache: true},
		},
		{
			name:     "configured TTL propagates to schema endpoints",
			settings: Settings{EnableSchemaCache: true, SchemaCacheTTLSeconds: 120},
			want:     ttlOverride,
		},
		{
			// LoadSettings clamps the TTL to a positive value, but the
			// mapping must not zero every endpoint if that invariant breaks.
			name:     "non-positive TTL keeps schemads defaults",
			settings: Settings{EnableSchemaCache: true, SchemaCacheTTLSeconds: 0},
			want:     schemas.DefaultOptions,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := schemaResourceOptions(tt.settings)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("schemaResourceOptions(%+v) = %+v, want %+v", tt.settings, got, tt.want)
			}
		})
	}
}

// countingTablesHandler records how many times the tables endpoint handler
// runs, so tests can observe whether responses were served from cache.
type countingTablesHandler struct {
	calls int
}

func (h *countingTablesHandler) Tables(context.Context, *schemas.TablesRequest) (*schemas.TablesResponse, error) {
	h.calls++
	return &schemas.TablesResponse{Tables: []string{"events"}}, nil
}

// TestSchemaResourceOptionsControlResponseCache drives the schemads resource
// handler exactly as NewDatasource wires it, asserting that the plugin's
// enableSchemaCache setting controls schemads response-level caching rather
// than the schemads defaults applying regardless.
func TestSchemaResourceOptionsControlResponseCache(t *testing.T) {
	tests := []struct {
		name      string
		settings  Settings
		wantCalls int
	}{
		{
			name:      "enabled cache serves repeat request from cache",
			settings:  Settings{EnableSchemaCache: true, SchemaCacheTTLSeconds: 300},
			wantCalls: 1,
		},
		{
			name:      "disabled cache re-runs the handler",
			settings:  Settings{EnableSchemaCache: false},
			wantCalls: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := &countingTablesHandler{}
			resource := schemas.NewSchemaDatasourceWithOptions(
				nil,
				handler,
				nil,
				nil,
				nil,
				nil,
				schemaResourceOptions(tt.settings),
			)

			req := &backend.CallResourceRequest{
				PluginContext: backend.PluginContext{
					Namespace: "default",
					User:      &backend.User{Login: "admin"},
					DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
						UID: "test-uid",
					},
				},
				Path:   schemas.BaseResourcePath + "/" + schemas.RequestTypeTables,
				Method: http.MethodPost,
			}
			sender := backend.CallResourceResponseSenderFunc(func(resp *backend.CallResourceResponse) error {
				if resp.Status != http.StatusOK {
					t.Errorf("unexpected response status %d, body %q", resp.Status, resp.Body)
				}
				return nil
			})

			for i := 0; i < 2; i++ {
				if err := resource.CallResource(context.Background(), req, sender); err != nil {
					t.Fatalf("CallResource request %d: %v", i+1, err)
				}
			}

			if handler.calls != tt.wantCalls {
				t.Errorf("tables handler ran %d times, want %d", handler.calls, tt.wantCalls)
			}
		})
	}
}
