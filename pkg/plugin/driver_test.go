package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/stretchr/testify/assert"
)

func TestMergeOpenTelemetryLabels(t *testing.T) {
	t.Run("Merge", func(t *testing.T) {
		resourceAttrs := []json.RawMessage{
			json.RawMessage(`{"foo":"bar"}`),
			json.RawMessage(`{"baz":"qux"}`),
		}
		scopeAttrs := []json.RawMessage{
			json.RawMessage(`{"scopeA":"123"}`),
			json.RawMessage(`{"scopeB":"456"}`),
		}
		otherField := []int64{1, 2}

		frame := &data.Frame{
			Fields: []*data.Field{
				data.NewField("ResourceAttributes", nil, resourceAttrs),
				data.NewField("ScopeAttributes", nil, scopeAttrs),
				data.NewField("other", nil, otherField),
			},
		}

		err := mergeOpenTelemetryLabels(frame)
		assert.NoError(t, err)
		assert.Equal(t, 2, len(frame.Fields))
		assert.Equal(t, "other", frame.Fields[0].Name)
		assert.Equal(t, "labels", frame.Fields[1].Name)

		labelsLen := frame.Fields[1].Len()
		for i := 0; i < labelsLen; i++ {
			labelValue, _ := frame.Fields[1].ConcreteAt(i)
			var labelsMap map[string]interface{}
			assert.NoError(t, json.Unmarshal(labelValue.(json.RawMessage), &labelsMap))
			// Keys should be prefixed
			if i == 0 {
				assert.Equal(t, "bar", labelsMap["ResourceAttributes.foo"])
				assert.Equal(t, "123", labelsMap["ScopeAttributes.scopeA"])
			} else {
				assert.Equal(t, "qux", labelsMap["ResourceAttributes.baz"])
				assert.Equal(t, "456", labelsMap["ScopeAttributes.scopeB"])
			}
		}
	})

	t.Run("LabelsFieldPresent", func(t *testing.T) {
		frame := &data.Frame{
			Fields: []*data.Field{
				data.NewField("labels", nil, []json.RawMessage{json.RawMessage(`{}`)}),
				data.NewField("ResourceAttributes", nil, []json.RawMessage{json.RawMessage(`{"foo":"bar"}`)}),
			},
		}
		err := mergeOpenTelemetryLabels(frame)
		assert.NoError(t, err)
		assert.Equal(t, 2, len(frame.Fields))
		assert.Equal(t, "labels", frame.Fields[0].Name) // Should not modify fields
	})

	t.Run("EmptyFields", func(t *testing.T) {
		frame := &data.Frame{
			Fields: []*data.Field{},
		}
		err := mergeOpenTelemetryLabels(frame)
		assert.NoError(t, err)
		assert.Equal(t, 0, len(frame.Fields))
	})

	t.Run("FieldTypeFilter", func(t *testing.T) {
		// Should ignore non-JSON fields
		frame := &data.Frame{
			Fields: []*data.Field{
				data.NewField("ResourceAttributes", nil, []string{`{"foo":"bar"}`, `{"zoo": "car"}`}),
				data.NewField("ScopeAttributes", nil, []int64{1, 2}),
			},
		}
		err := mergeOpenTelemetryLabels(frame)
		assert.NoError(t, err)
		assert.Equal(t, 2, len(frame.Fields))
		assert.Equal(t, "ResourceAttributes", frame.Fields[0].Name)
		assert.Equal(t, "ScopeAttributes", frame.Fields[1].Name)
	})
}

func TestAssignFlattenedPath(t *testing.T) {
	t.Run("simple value", func(t *testing.T) {
		flatMap := make(map[string]any)
		assignFlattenedPath(flatMap, "root", "key", "value")

		expected := map[string]any{
			"root.key": "value",
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("empty path key", func(t *testing.T) {
		flatMap := make(map[string]any)
		assignFlattenedPath(flatMap, "root", "", "value")

		expected := map[string]any{
			"root": "value",
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("nested map", func(t *testing.T) {
		flatMap := make(map[string]any)
		nestedValue := map[string]any{
			"a": "val1",
			"b": "val2",
		}

		assignFlattenedPath(flatMap, "root", "nested", nestedValue)

		expected := map[string]any{
			"root.nested.a": "val1",
			"root.nested.b": "val2",
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("deeply nested map", func(t *testing.T) {
		flatMap := make(map[string]any)
		deeplyNested := map[string]any{
			"level1": map[string]any{
				"level2": map[string]any{
					"level3":     "l3_value",
					"level3_alt": "l3_value2",
				},
				"level2_alt": "l2_value",
			},
			"level1_alt": "l1_value",
		}

		assignFlattenedPath(flatMap, "root", "deep", deeplyNested)

		expected := map[string]any{
			"root.deep.level1.level2.level3":     "l3_value",
			"root.deep.level1.level2.level3_alt": "l3_value2",
			"root.deep.level1.level2_alt":        "l2_value",
			"root.deep.level1_alt":               "l1_value",
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("empty nested map", func(t *testing.T) {
		flatMap := make(map[string]any)
		emptyMap := map[string]any{}

		assignFlattenedPath(flatMap, "root", "empty", emptyMap)

		expected := map[string]any{}
		assert.Equal(t, expected, flatMap)
	})

	t.Run("mixed types", func(t *testing.T) {
		flatMap := make(map[string]any)
		mixedValue := map[string]any{
			"string":  "test",
			"number":  42,
			"boolean": true,
			"float":   3.14,
			"null":    nil,
		}

		assignFlattenedPath(flatMap, "data", "mixed", mixedValue)

		expected := map[string]any{
			"data.mixed.string":  "test",
			"data.mixed.number":  42,
			"data.mixed.boolean": true,
			"data.mixed.float":   3.14,
			"data.mixed.null":    nil,
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("non-map values", func(t *testing.T) {
		tests := []struct {
			name     string
			value    any
			expected any
		}{
			{"string", "hello", "hello"},
			{"int", 123, 123},
			{"bool", false, false},
			{"slice", []int{1, 2, 3}, []int{1, 2, 3}},
			{"nil", nil, nil},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				flatMap := make(map[string]any)
				assignFlattenedPath(flatMap, "root", "key", tt.value)

				expected := map[string]any{
					"root.key": tt.expected,
				}

				assert.Equal(t, expected, flatMap)
			})
		}
	})

	t.Run("complex nesting multiple calls", func(t *testing.T) {
		flatMap := make(map[string]any)

		assignFlattenedPath(flatMap, "config", "database", map[string]any{
			"host": "localhost",
			"port": 8123,
			"credentials": map[string]any{
				"username": "admin",
				"password": "pass",
			},
		})

		assignFlattenedPath(flatMap, "config", "server", map[string]any{
			"port":   9000,
			"secure": true,
		})

		assignFlattenedPath(flatMap, "config", "some_key", "some_value")

		expected := map[string]any{
			"config.database.host":                 "localhost",
			"config.database.port":                 8123,
			"config.database.credentials.username": "admin",
			"config.database.credentials.password": "pass",
			"config.server.port":                   9000,
			"config.server.secure":                 true,
			"config.some_key":                      "some_value",
		}

		assert.Equal(t, expected, flatMap)
	})

	t.Run("empty path prefix", func(t *testing.T) {
		flatMap := make(map[string]any)

		assignFlattenedPath(flatMap, "", "key", "value")

		expected := map[string]any{
			".key": "value",
		}

		assert.Equal(t, expected, flatMap)
	})
}

func TestContainsClickHouseException(t *testing.T) {
	t.Run("nil error", func(t *testing.T) {
		result := containsClickHouseException(nil)
		assert.False(t, result)
	})

	t.Run("direct clickhouse exception", func(t *testing.T) {
		chErr := &clickhouse.Exception{
			Code:    60,
			Message: "Unknown table",
		}
		result := containsClickHouseException(chErr)
		assert.True(t, result)
	})

	t.Run("wrapped clickhouse exception", func(t *testing.T) {
		chErr := &clickhouse.Exception{
			Code:    62,
			Message: "Syntax error",
		}
		wrappedErr := fmt.Errorf("query failed: %w", chErr)
		result := containsClickHouseException(wrappedErr)
		assert.True(t, result)
	})

	t.Run("HTTP response body with clickhouse error", func(t *testing.T) {
		errMsg := `error querying the database: sendQuery: [HTTP 404] response body: \"Code: 60. DB::Exception: Unknown table expression identifier 'hello' in scope SELECT * FROM hello. (UNKNOWN_TABLE) (version 25.1.3.23 (official build))\n\"`
		err := errors.New(errMsg)
		result := containsClickHouseException(err)
		assert.True(t, result)
	})

	t.Run("HTTP response body with legacy clickhouse error", func(t *testing.T) {
		errMsg := `error querying the database: sendQuery: [HTTP 404] response body: \"[Error] Unknown table expression identifier 'hello' in scope SELECT * FROM hello. (UNKNOWN_TABLE) (version 25.1.3.23 (official build))\n\"`
		err := errors.New(errMsg)
		result := containsClickHouseException(err)
		assert.True(t, result)
	})

	t.Run("regular error without clickhouse patterns", func(t *testing.T) {
		err := errors.New("connection timeout")
		result := containsClickHouseException(err)
		assert.False(t, result)
	})

	t.Run("multi-error with clickhouse exception", func(t *testing.T) {
		chErr := &clickhouse.Exception{
			Code:    60,
			Message: "Unknown table",
		}
		regularErr := errors.New("regular error")
		multiErr := errors.Join(regularErr, chErr)
		result := containsClickHouseException(multiErr)
		assert.True(t, result)
	})
}

func TestMutateQueryData(t *testing.T) {
	h := &Clickhouse{}

	tests := []struct {
		name   string
		headers map[string]string
		want   grafanaHeaders
		stored bool
	}{
		{
			name: "all headers",
			headers: map[string]string{
				"http_X-Dashboard-Uid": "dash-abc123",
				"http_X-Panel-Id":      "42",
				"http_X-Rule-Uid":      "rule-xyz",
			},
			want:   grafanaHeaders{DashboardUID: "dash-abc123", PanelID: "42", RuleUID: "rule-xyz"},
			stored: true,
		},
		{
			name:    "empty headers",
			headers: map[string]string{},
			stored:  false,
		},
		{
			name:    "only dashboard",
			headers: map[string]string{"http_X-Dashboard-Uid": "dash-only"},
			want:    grafanaHeaders{DashboardUID: "dash-only"},
			stored:  true,
		},
		{
			name:    "only panel",
			headers: map[string]string{"http_X-Panel-Id": "99"},
			want:    grafanaHeaders{PanelID: "99"},
			stored:  true,
		},
		{
			name:    "only rule",
			headers: map[string]string{"http_X-Rule-Uid": "alert-rule-1"},
			want:    grafanaHeaders{RuleUID: "alert-rule-1"},
			stored:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := &backend.QueryDataRequest{Headers: tt.headers}
			newCtx, _ := h.MutateQueryData(t.Context(), req)

			gh, ok := newCtx.Value(grafanaHeadersKey).(grafanaHeaders)
			assert.Equal(t, tt.stored, ok)
			if tt.stored {
				assert.Equal(t, tt.want, gh)
			}
		})
	}

	t.Run("nil headers does not panic", func(t *testing.T) {
		newCtx, newReq := h.MutateQueryData(t.Context(), &backend.QueryDataRequest{})
		assert.NotNil(t, newCtx)
		assert.NotNil(t, newReq)
	})
}

func TestMutateQuery_GrafanaMetadata(t *testing.T) {
	h := &Clickhouse{}

	t.Run("includes dashboard and panel from context", func(t *testing.T) {
		ctx := context.WithValue(t.Context(), grafanaHeadersKey, grafanaHeaders{
			DashboardUID: "my-dashboard",
			PanelID:      "7",
			RuleUID:      "alert-1",
		})

		newCtx, _ := h.MutateQuery(ctx, backend.DataQuery{
			JSON: []byte(`{}`),
		})

		assert.NotEqual(t, ctx, newCtx)
	})

	t.Run("no grafana headers in context still works", func(t *testing.T) {
		ctx := t.Context()

		newCtx, _ := h.MutateQuery(ctx, backend.DataQuery{
			JSON: []byte(`{}`),
		})

		assert.NotNil(t, newCtx)
		_, ok := newCtx.Value(grafanaHeadersKey).(grafanaHeaders)
		assert.False(t, ok)
	})

	t.Run("handles invalid JSON gracefully", func(t *testing.T) {
		ctx := context.WithValue(t.Context(), grafanaHeadersKey, grafanaHeaders{
			DashboardUID: "dash1",
		})

		newCtx, _ := h.MutateQuery(ctx, backend.DataQuery{
			JSON: []byte(`invalid json`),
		})

		assert.NotEqual(t, ctx, newCtx)
	})
}

func TestMutateQueryData_XGrafanaUserForwarding(t *testing.T) {
	h := &Clickhouse{}

	newRequest := func(forward bool) *backend.QueryDataRequest {
		jsonBytes, _ := json.Marshal(map[string]any{
			"host":                  "localhost",
			"port":                  9000,
			"forwardGrafanaHeaders": forward,
		})
		return &backend.QueryDataRequest{
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: jsonBytes,
				},
			},
			Headers: map[string]string{},
		}
	}

	t.Run("populates X-Grafana-User from context when forwardGrafanaHeaders is enabled", func(t *testing.T) {
		req := newRequest(true)
		ctx := backend.WithUser(t.Context(), &backend.User{Login: "alice"})

		h.MutateQueryData(ctx, req)

		assert.Equal(t, "alice", req.GetHTTPHeader("X-Grafana-User"))
	})

	t.Run("does not inject when forwardGrafanaHeaders is disabled", func(t *testing.T) {
		req := newRequest(false)
		ctx := backend.WithUser(t.Context(), &backend.User{Login: "alice"})

		h.MutateQueryData(ctx, req)

		assert.Empty(t, req.GetHTTPHeader("X-Grafana-User"))
	})

	t.Run("does not override header already set by Grafana proxy", func(t *testing.T) {
		req := newRequest(true)
		req.SetHTTPHeader("X-Grafana-User", "from-proxy")
		ctx := backend.WithUser(t.Context(), &backend.User{Login: "alice"})

		h.MutateQueryData(ctx, req)

		assert.Equal(t, "from-proxy", req.GetHTTPHeader("X-Grafana-User"))
	})

	t.Run("no user in context is a no-op", func(t *testing.T) {
		req := newRequest(true)

		h.MutateQueryData(t.Context(), req)

		assert.Empty(t, req.GetHTTPHeader("X-Grafana-User"))
	})

	t.Run("nil DataSourceInstanceSettings is a no-op", func(t *testing.T) {
		req := &backend.QueryDataRequest{Headers: map[string]string{}}
		ctx := backend.WithUser(t.Context(), &backend.User{Login: "alice"})

		// Should not panic and should not set the header.
		h.MutateQueryData(ctx, req)

		assert.Empty(t, req.GetHTTPHeader("X-Grafana-User"))
	})

	t.Run("empty Login is a no-op", func(t *testing.T) {
		req := newRequest(true)
		ctx := backend.WithUser(t.Context(), &backend.User{Login: ""})

		h.MutateQueryData(ctx, req)

		assert.Empty(t, req.GetHTTPHeader("X-Grafana-User"))
	})
}

func TestSettingsForwardHeadersWithJWT(t *testing.T) {
	h := &Clickhouse{}

	t.Run("ForwardHeaders is true when useJWTAuth is enabled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			JSONData:                []byte(`{"host": "test", "port": 443, "useJWTAuth": true, "forwardGrafanaHeaders": false}`),
			DecryptedSecureJSONData: map[string]string{},
		}
		ds := h.Settings(t.Context(), config)
		assert.True(t, ds.ForwardHeaders)
	})

	t.Run("ForwardHeaders is true when forwardGrafanaHeaders is enabled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			JSONData:                []byte(`{"host": "test", "port": 443, "useJWTAuth": false, "forwardGrafanaHeaders": true}`),
			DecryptedSecureJSONData: map[string]string{},
		}
		ds := h.Settings(t.Context(), config)
		assert.True(t, ds.ForwardHeaders)
	})

	t.Run("ForwardHeaders is false when both are disabled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			JSONData:                []byte(`{"host": "test", "port": 443}`),
			DecryptedSecureJSONData: map[string]string{},
		}
		ds := h.Settings(t.Context(), config)
		assert.False(t, ds.ForwardHeaders)
	})
}

func TestExtractForwardedHeadersWithAuthorization(t *testing.T) {
	t.Run("extracts Authorization header from message", func(t *testing.T) {
		message := json.RawMessage(`{
			"grafana-http-headers": {
				"Authorization": ["Bearer test-token-123"],
				"X-Grafana-User": ["alice"]
			}
		}`)
		headers, err := extractForwardedHeadersFromMessage(message)
		assert.NoError(t, err)
		assert.Equal(t, "Bearer test-token-123", headers["Authorization"])
		assert.Equal(t, "alice", headers["X-Grafana-User"])
	})

	t.Run("returns empty map when message is nil", func(t *testing.T) {
		headers, err := extractForwardedHeadersFromMessage(nil)
		assert.NoError(t, err)
		assert.Empty(t, headers)
	})
}

func TestResolveJWTAuth(t *testing.T) {
	baseSettings := Settings{
		DefaultDatabase: "default",
		Username:        "admin",
		Password:        "secret",
	}

	t.Run("JWT enabled clears credentials and moves token to GetJWT", func(t *testing.T) {
		s := baseSettings
		s.UseJWTAuth = true
		headers := map[string]string{"Authorization": "Bearer my-jwt-token"}

		auth, getJWT := resolveJWTAuth(s, headers)

		assert.Empty(t, auth.Username)
		assert.Empty(t, auth.Password)
		assert.Equal(t, "default", auth.Database)
		assert.NotNil(t, getJWT)

		token, err := getJWT(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, "my-jwt-token", token)

		_, exists := headers["Authorization"]
		assert.False(t, exists, "Authorization header should be removed from httpHeaders")
	})

	t.Run("JWT enabled but no token falls back to credentials", func(t *testing.T) {
		s := baseSettings
		s.UseJWTAuth = true
		headers := map[string]string{}

		auth, getJWT := resolveJWTAuth(s, headers)

		assert.Equal(t, "admin", auth.Username)
		assert.Equal(t, "secret", auth.Password)
		assert.Nil(t, getJWT)
	})

	t.Run("JWT disabled uses credentials regardless of token", func(t *testing.T) {
		s := baseSettings
		s.UseJWTAuth = false
		headers := map[string]string{"Authorization": "Bearer some-token"}

		auth, getJWT := resolveJWTAuth(s, headers)

		assert.Equal(t, "admin", auth.Username)
		assert.Equal(t, "secret", auth.Password)
		assert.Nil(t, getJWT)
		assert.Equal(t, "Bearer some-token", headers["Authorization"])
	})
}

func TestBuildClickHouseOptionsJWTBothProtocols(t *testing.T) {
	message := json.RawMessage(`{"grafana-http-headers":{"Authorization":["Bearer my-jwt-token"]}}`)

	for _, protocol := range []string{"native", "http"} {
		t.Run(protocol, func(t *testing.T) {
			settings := Settings{
				Host:         "localhost",
				Port:         9440,
				Protocol:     protocol,
				Secure:       true,
				UseJWTAuth:   true,
				Username:     "svc",
				Password:     "fallback",
				DialTimeout:  "5",
				QueryTimeout: "30",
			}

			opts, err := buildClickHouseOptions(t.Context(), settings, message)
			assert.NoError(t, err)

			assert.NotNil(t, opts.GetJWT, "GetJWT must be set for %s protocol", protocol)
			token, err := opts.GetJWT(context.Background())
			assert.NoError(t, err)
			assert.Equal(t, "my-jwt-token", token)

			assert.Empty(t, opts.Auth.Username, "username must be cleared when JWT is active")
			assert.Empty(t, opts.Auth.Password, "password must be cleared when JWT is active")
		})
	}
}

func TestBuildClickHouseOptionsJWTFallbackWithoutToken(t *testing.T) {
	message := json.RawMessage(`{}`)

	settings := Settings{
		Host:         "localhost",
		Port:         9440,
		Protocol:     "native",
		Secure:       true,
		UseJWTAuth:   true,
		Username:     "svc",
		Password:     "fallback",
		DialTimeout:  "5",
		QueryTimeout: "30",
	}

	opts, err := buildClickHouseOptions(t.Context(), settings, message)
	assert.NoError(t, err)

	assert.Nil(t, opts.GetJWT, "GetJWT must be nil when no token is forwarded")
	assert.Equal(t, "svc", opts.Auth.Username)
	assert.Equal(t, "fallback", opts.Auth.Password)
}
