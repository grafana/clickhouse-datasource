package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
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
