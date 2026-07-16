package converters

import (
	"encoding/json"
	"errors"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- shared test helpers (used across the *_test.go files in this package) ----

// ref returns a pointer to v. Nesting it (ref(ref(x))) builds the multi-level
// pointers some converters receive from the driver.
func ref[T any](v T) *T { return &v }

// bigFloat mirrors how bigIntConvert renders a big.Int as float64.
func bigFloat(i int64) float64 {
	f, _ := new(big.Float).SetInt(big.NewInt(i)).Float64()
	return f
}

// runConverter looks up columnType, asserts a converter was found, runs its
// ConverterFunc on in and asserts no error, returning the produced value.
func runConverter(t *testing.T, columnType string, in any) any {
	t.Helper()
	sut := GetConverter(columnType)
	require.NotNil(t, sut.InputScanType, "converter not found for %s", columnType)
	v, err := sut.FrameConverter.ConverterFunc(in)
	require.NoError(t, err)
	return v
}

func toJson(obj interface{}) (json.RawMessage, error) {
	bytes, err := json.Marshal(obj)
	if err != nil {
		return nil, errors.New("unable to marshal")
	}
	var rawJSON json.RawMessage
	err = json.Unmarshal(bytes, &rawJSON)
	if err != nil {
		return nil, errors.New("unable to unmarshal")
	}
	return rawJSON, nil
}

// ---- lookup mechanics ----

func TestGetConverterUnknownType(t *testing.T) {
	sut := GetConverter("NoSuchType(123)")
	assert.Nil(t, sut.InputScanType, "unknown types should return the zero converter")
}

// TestClickHouseConvertersAssembly checks the ordered assembly invariants relied on
// by sqlutil's first-match-wins converter selection.
func TestClickHouseConvertersAssembly(t *testing.T) {
	list := ClickHouseConverters()
	require.NotEmpty(t, list)

	// The SAF catch-all must be last so more specific converters win first.
	last := list[len(list)-1]
	assert.Equal(t, "SimpleAggregateFunction()", last.InputTypeName)
	require.NotNil(t, last.InputTypeRegex)
	assert.True(t, last.InputTypeRegex.MatchString("SimpleAggregateFunction(any, CustomType)"))

	// Nothing before the catch-all is the catch-all.
	for _, c := range list[:len(list)-1] {
		assert.NotEqual(t, "SimpleAggregateFunction()", c.InputTypeName)
	}

	// The exported var mirrors the constructor.
	assert.Equal(t, len(list), len(ClickhouseConverters))
}

func TestExtractSimpleAggregateFunctionType(t *testing.T) {
	cases := []struct {
		inputType    string
		expectedType string
		expectedOk   bool
	}{
		{"SimpleAggregateFunction(any, String)", "String", true},
		{"SimpleAggregateFunction(any, Nullable(String))", "Nullable(String)", true},
		{"SimpleAggregateFunction(anyLast, Nullable(UInt16))", "Nullable(UInt16)", true},
		{"SimpleAggregateFunction(any, Array(String))", "Array(String)", true},
		{"SimpleAggregateFunction(any, Map(String, UInt64))", "Map(String, UInt64)", true},
		{"SimpleAggregateFunction(sum)", "", false},   // no top-level comma
		{"SimpleAggregateFunction(sum, )", "", false}, // empty inner type
		{"String", "", false},
		{"LowCardinality(String)", "", false},
	}

	for _, c := range cases {
		t.Run(c.inputType, func(t *testing.T) {
			actualType, actualOk := extractSimpleAggregateFunctionType(c.inputType)
			assert.Equal(t, c.expectedOk, actualOk)
			assert.Equal(t, c.expectedType, actualType)
		})
	}
}

func TestExtractLowCardinality(t *testing.T) {
	cases := []struct {
		inputType    string
		expectedType string
		expectedOk   bool
	}{
		{"Nullable(LowCardinality(String))", "", false},
		{"String", "", false},
		{"LowCardinality(String)", "String", true},
		{"LowCardinality(Nullable(String))", "Nullable(String)", true},
	}

	for _, c := range cases {
		t.Run(c.inputType, func(t *testing.T) {
			actualType, actualOk := extractLowCardinalityType(c.inputType)
			assert.Equal(t, c.expectedOk, actualOk)
			assert.Equal(t, c.expectedType, actualType)
		})
	}
}
