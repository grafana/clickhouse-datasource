package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
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

func TestExpandMacrosInQuery(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")

	t.Run("expands macros and preserves sibling JSON fields", func(t *testing.T) {
		q := backend.DataQuery{
			RefID:     "A",
			JSON:      []byte(`{"rawSql":"SELECT $__fromTime","format":1,"meta":{"timezone":"UTC"}}`),
			TimeRange: backend.TimeRange{From: from, To: to},
		}
		out := expandMacrosInQuery(q)

		var body struct {
			RawSQL string `json:"rawSql"`
			Format int    `json:"format"`
			Meta   struct {
				Timezone string `json:"timezone"`
			} `json:"meta"`
		}
		require.NoError(t, json.Unmarshal(out.JSON, &body))
		assert.Equal(t, "SELECT toDateTime(1415792726)", body.RawSQL)
		assert.Equal(t, 1, body.Format)
		assert.Equal(t, "UTC", body.Meta.Timezone)
	})

	t.Run("rewrites rawSql to throwIf on macro error", func(t *testing.T) {
		// $__timeFilter with zero args triggers a badArgsErr.
		q := backend.DataQuery{
			RefID:     "A",
			JSON:      []byte(`{"rawSql":"SELECT $__timeFilter()"}`),
			TimeRange: backend.TimeRange{From: from, To: to},
		}
		out := expandMacrosInQuery(q)

		var body struct {
			RawSQL string `json:"rawSql"`
		}
		require.NoError(t, json.Unmarshal(out.JSON, &body))
		assert.True(t, strings.HasPrefix(body.RawSQL, "SELECT throwIf(1, 'macro expansion failed: "))
		assert.Contains(t, body.RawSQL, "timeFilter")
		// $__ tokens leaking into the throwIf payload would be re-expanded by
		// sqlutil.DefaultMacros downstream and hide the throwIf behind a
		// "Could not apply macros" error, so the rewrite must scrub them.
		assert.NotContains(t, body.RawSQL, "$__")
	})

	t.Run("escapes single quotes and scrubs $__ in throwIf message", func(t *testing.T) {
		// ClickHouse string literals escape ' as ''. macroErrorQuery must
		// double every single quote so a message containing one can't
		// prematurely close the literal, and strip $__ prefixes so
		// sqlutil's downstream macro scan doesn't mistake them for macros.
		got := macroErrorQuery(errors.New("$__timeFilter failed: oh 'no' it broke"))
		assert.Equal(t, "SELECT throwIf(1, 'macro expansion failed: __timeFilter failed: oh ''no'' it broke')", got)
	})

	t.Run("returns query unchanged when there are no macros", func(t *testing.T) {
		raw := []byte(`{"rawSql":"SELECT 1","format":1}`)
		q := backend.DataQuery{RefID: "A", JSON: raw}
		out := expandMacrosInQuery(q)
		assert.JSONEq(t, string(raw), string(out.JSON))
	})

	t.Run("returns query unchanged when rawSql is empty", func(t *testing.T) {
		raw := []byte(`{"rawSql":""}`)
		q := backend.DataQuery{RefID: "A", JSON: raw}
		out := expandMacrosInQuery(q)
		assert.JSONEq(t, string(raw), string(out.JSON))
	})
}
