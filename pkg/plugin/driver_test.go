package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		name    string
		headers map[string]string
		want    grafanaHeaders
		stored  bool
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

func TestMutateQuery_MinInterval(t *testing.T) {
	h := &Clickhouse{}

	cases := []struct {
		name         string
		json         string
		interval     time.Duration
		wantInterval time.Duration
	}{
		{"raises the interval", `{"timeInterval":"5m"}`, 30 * time.Second, 5 * time.Minute},
		{"never lowers the interval", `{"timeInterval":"1s"}`, 30 * time.Second, 30 * time.Second},
		{"supports day units", `{"timeInterval":"1d"}`, time.Hour, 24 * time.Hour},
		{"supports week units", `{"timeInterval":"1w"}`, time.Hour, 7 * 24 * time.Hour},
		{"trims surrounding space", `{"timeInterval":" 5m "}`, 30 * time.Second, 5 * time.Minute},
		{"ignores an empty value", `{}`, 30 * time.Second, 30 * time.Second},
		{"ignores an unparseable value", `{"timeInterval":"soon"}`, 30 * time.Second, 30 * time.Second},
		// The frontend refuses these too (src/data/queryInterval.ts); both sides
		// share one grammar so $__interval and $__timeInterval cannot disagree.
		{"ignores a unit-less value", `{"timeInterval":"60"}`, 30 * time.Second, 30 * time.Second},
		{"ignores trailing garbage", `{"timeInterval":"5minutes"}`, 30 * time.Second, 30 * time.Second},
		{"ignores a fractional value", `{"timeInterval":"1.5m"}`, 30 * time.Second, 30 * time.Second},
		{"ignores a compound duration", `{"timeInterval":"1h30m"}`, 30 * time.Second, 30 * time.Second},
		{"ignores month and year units", `{"timeInterval":"1M"}`, 30 * time.Second, 30 * time.Second},
		{"ignores a value past the upper bound", `{"timeInterval":"366d"}`, 30 * time.Second, 30 * time.Second},
		{"ignores a value that would overflow", `{"timeInterval":"9999999999d"}`, 30 * time.Second, 30 * time.Second},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, req := h.MutateQuery(t.Context(), backend.DataQuery{
				JSON:     []byte(tc.json),
				Interval: tc.interval,
			})

			assert.Equal(t, tc.wantInterval, req.Interval)
		})
	}
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

	t.Run("ForwardHeaders is true when oauthPassThru is enabled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			JSONData:                []byte(`{"host": "test", "port": 443, "oauthPassThru": true, "forwardGrafanaHeaders": false}`),
			DecryptedSecureJSONData: map[string]string{},
		}
		ds := h.Settings(t.Context(), config)
		assert.True(t, ds.ForwardHeaders)
	})

	t.Run("ForwardHeaders is true when forwardGrafanaHeaders is enabled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			JSONData:                []byte(`{"host": "test", "port": 443, "oauthPassThru": false, "forwardGrafanaHeaders": true}`),
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
		s.OAuthPassThru = true
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

	t.Run("token is read from the SDK OAuth identity header constant", func(t *testing.T) {
		s := baseSettings
		s.OAuthPassThru = true
		// Key the header with the SDK constant rather than a literal so this
		// fails if backend.OAuthIdentityTokenHeaderName ever stops being the
		// header resolveJWTAuth reads.
		headers := map[string]string{backend.OAuthIdentityTokenHeaderName: "Bearer my-jwt-token"}

		auth, getJWT := resolveJWTAuth(s, headers)

		assert.Empty(t, auth.Username)
		assert.Empty(t, auth.Password)
		assert.NotNil(t, getJWT)

		token, err := getJWT(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, "my-jwt-token", token)

		_, exists := headers[backend.OAuthIdentityTokenHeaderName]
		assert.False(t, exists, "OAuth identity header should be removed from httpHeaders")
	})

	t.Run("JWT enabled but no token falls back to credentials", func(t *testing.T) {
		s := baseSettings
		s.OAuthPassThru = true
		headers := map[string]string{}

		auth, getJWT := resolveJWTAuth(s, headers)

		assert.Equal(t, "admin", auth.Username)
		assert.Equal(t, "secret", auth.Password)
		assert.Nil(t, getJWT)
	})

	t.Run("JWT disabled uses credentials regardless of token", func(t *testing.T) {
		s := baseSettings
		s.OAuthPassThru = false
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
				Host:          "localhost",
				Port:          9440,
				Protocol:      protocol,
				Secure:        true,
				OAuthPassThru: true,
				Username:      "svc",
				Password:      "fallback",
				DialTimeout:   "5",
				QueryTimeout:  "30",
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

// baseJWTSettings returns a valid secure OAuthPassThru configuration with a
// service-account username/password configured as the fallback credential.
func baseJWTSettings() Settings {
	return Settings{
		Host:          "localhost",
		Port:          9440,
		Protocol:      "native",
		Secure:        true,
		OAuthPassThru: true,
		Username:      "svc",
		Password:      "fallback",
		DialTimeout:   "5",
		QueryTimeout:  "30",
	}
}

func TestBuildClickHouseOptionsJWTDataQueryWithoutToken(t *testing.T) {
	// A data query (non-nil message) with no forwarded user token is a backend
	// query with no identity to attribute it to — typically alert evaluation.
	dataQuery := json.RawMessage(`{}`)

	t.Run("blocked by default", func(t *testing.T) {
		settings := baseJWTSettings()

		_, err := buildClickHouseOptions(t.Context(), settings, dataQuery)
		require.Error(t, err, "data queries without a forwarded token must be rejected when fallback is not allowed")
		assert.Contains(t, err.Error(), "no user identity")
	})

	t.Run("falls back to service account when fallback is allowed", func(t *testing.T) {
		settings := baseJWTSettings()
		settings.OAuthPassThruAllowFallback = true

		opts, err := buildClickHouseOptions(t.Context(), settings, dataQuery)
		require.NoError(t, err)

		assert.Nil(t, opts.GetJWT, "GetJWT must be nil when no token is forwarded")
		assert.Equal(t, "svc", opts.Auth.Username)
		assert.Equal(t, "fallback", opts.Auth.Password)
	})
}

func TestBuildClickHouseOptionsJWTHealthCheckAlwaysFallsBack(t *testing.T) {
	// Health checks and schema introspection pass a nil message; no user token
	// is ever available for them, so they always fall back regardless of the
	// OAuthPassThruAllowFallback setting.
	for _, allowFallback := range []bool{false, true} {
		t.Run(fmt.Sprintf("allowFallback=%v", allowFallback), func(t *testing.T) {
			settings := baseJWTSettings()
			settings.OAuthPassThruAllowFallback = allowFallback

			opts, err := buildClickHouseOptions(t.Context(), settings, nil)
			require.NoError(t, err, "health checks (nil message) must never be blocked")

			assert.Nil(t, opts.GetJWT)
			assert.Equal(t, "svc", opts.Auth.Username)
			assert.Equal(t, "fallback", opts.Auth.Password)
		})
	}
}

func TestBuildClickHouseOptionsJWTRequiresTLS(t *testing.T) {
	// Forward OAuth Identity must never be used over a plaintext connection.
	message := json.RawMessage(`{"grafana-http-headers":{"Authorization":["Bearer my-jwt-token"]}}`)

	settings := baseJWTSettings()
	settings.Secure = false

	_, err := buildClickHouseOptions(t.Context(), settings, message)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "secure (TLS) connection")
}

func TestBuildClickHouseOptionsJWTRejectsSkipTLSVerify(t *testing.T) {
	// Forwarding a user token over a connection whose server certificate is
	// not verified would expose it to interception.
	message := json.RawMessage(`{"grafana-http-headers":{"Authorization":["Bearer my-jwt-token"]}}`)

	settings := baseJWTSettings()
	settings.InsecureSkipVerify = true

	_, err := buildClickHouseOptions(t.Context(), settings, message)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Skip TLS Verify")
}

func TestInterpolateMacros(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	timeRange := backend.TimeRange{From: from, To: to}

	t.Run("expands macros from the parsed query", func(t *testing.T) {
		q := &sqlutil.Query{RawSQL: "SELECT $__fromTime", TimeRange: timeRange}
		got, err := interpolateMacros(t.Context(), q, nil)
		require.NoError(t, err)
		assert.Equal(t, "SELECT toDateTime(1415792726)", got)
	})

	t.Run("expands table and column from query context", func(t *testing.T) {
		// Table/Column only flow into macro handlers now that interpolation
		// runs on the parsed sqlutil.Query; the old MutateQueryData
		// pre-expansion never carried them.
		q := &sqlutil.Query{RawSQL: "SELECT $__column FROM $__table", TimeRange: timeRange, Table: "logs", Column: "ts"}
		got, err := interpolateMacros(t.Context(), q, nil)
		require.NoError(t, err)
		assert.Equal(t, "SELECT ts FROM logs", got)
	})

	t.Run("expands macros nested in another macro's arguments", func(t *testing.T) {
		// Regression guard: after the macropro migration the inner macro was
		// left verbatim ($__timeInterval($__fromTime) → toDateTime($__fromTime))
		// and the query failed at runtime with UNKNOWN_IDENTIFIER.
		q := &sqlutil.Query{RawSQL: "SELECT $__timeInterval($__fromTime) AS from_time", TimeRange: timeRange, Interval: time.Minute}
		got, err := interpolateMacros(t.Context(), q, nil)
		require.NoError(t, err)
		assert.Equal(t, "SELECT toStartOfInterval(toDateTime(toDateTime(1415792726)), INTERVAL 60 second) AS from_time", got)
	})

	t.Run("returns a downstream error on bad macro arguments", func(t *testing.T) {
		// $__timeFilter with zero args triggers a badArgsErr. The error goes
		// back to sqlds, which puts it on the query response; it must be
		// classified downstream so a user typo isn't counted as a plugin bug.
		q := &sqlutil.Query{RawSQL: "SELECT $__timeFilter()", TimeRange: timeRange}
		_, err := interpolateMacros(t.Context(), q, nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, sqlutil.ErrorBadArgumentCount)
		assert.True(t, backend.IsDownstreamError(err))
		assert.Contains(t, err.Error(), "timeFilter")
	})

	t.Run("returns SQL unchanged when there are no macros", func(t *testing.T) {
		q := &sqlutil.Query{RawSQL: "SELECT 1", TimeRange: timeRange}
		got, err := interpolateMacros(t.Context(), q, nil)
		require.NoError(t, err)
		assert.Equal(t, "SELECT 1", got)
	})

	t.Run("returns a downstream error from macropro default handlers", func(t *testing.T) {
		// macropro's own $__table / $__column handlers return plain errors
		// with no backend error source, unlike our handlers which wrap
		// backend.DownstreamError themselves. The interpolator must classify
		// these downstream too: every interpolation failure originates from
		// the user's query text, never from a plugin bug.
		q := &sqlutil.Query{RawSQL: "SELECT * FROM $__table", TimeRange: timeRange}
		_, err := interpolateMacros(t.Context(), q, nil)
		require.Error(t, err)
		assert.True(t, backend.IsDownstreamError(err))
	})
}

// TestMissingTableMacroIsDownstream proves the downstream classification
// survives the full sqlds.QueryData path: the interpolator error must land on
// the query response with ErrorSourceDownstream, not the plugin default.
func TestMissingTableMacroIsDownstream(t *testing.T) {
	ds := sqlds.NewDatasource(&Clickhouse{})
	ds.Interpolator = interpolateMacros

	resp, err := ds.QueryData(t.Context(), &backend.QueryDataRequest{
		Queries: []backend.DataQuery{{
			RefID: "A",
			JSON:  []byte(`{"rawSql":"SELECT * FROM $__table"}`),
		}},
	})
	require.NoError(t, err)

	got := resp.Responses["A"]
	require.Error(t, got.Error)
	assert.Equal(t, backend.ErrorSourceDownstream, got.ErrorSource)
}
