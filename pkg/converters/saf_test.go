package converters

import (
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// findByRegex returns the first converter in the assembled list whose regex matches
// typeName — the production selection path sqlutil uses.
func findByRegex(typeName string) sqlutil.Converter {
	for _, c := range ClickHouseConverters() {
		if c.InputTypeRegex != nil && c.InputTypeRegex.MatchString(typeName) {
			return c
		}
	}
	return sqlutil.Converter{}
}

// TestSimpleAggregateFunctionStringRegex covers the production regex path for SAF String.
func TestSimpleAggregateFunctionStringRegex(t *testing.T) {
	sut := findConverterWithRegex("SimpleAggregateFunction(any, String)")
	require.NotNil(t, sut.InputScanType)
	assert.Equal(t, data.FieldTypeString, sut.FrameConverter.FieldType)

	value := "hello"
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Equal(t, "hello", v.(string))
}

func TestSimpleAggregateFunctionNullableStringRegex(t *testing.T) {
	sut := findConverterWithRegex("SimpleAggregateFunction(any, Nullable(String))")
	require.NotNil(t, sut.InputScanType)
	assert.Equal(t, data.FieldTypeNullableString, sut.FrameConverter.FieldType)

	value := "world"
	val := &value
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	assert.Equal(t, "world", *v.(*string))
}

func TestSimpleAggregateFunctionNullableStringNilRegex(t *testing.T) {
	sut := findConverterWithRegex("SimpleAggregateFunction(any, Nullable(String))")
	require.NotNil(t, sut.InputScanType)

	var val *string
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	assert.Nil(t, v)
}

// TestSimpleAggregateFunctionNativeTypes checks that generated SAF converters resolve
// numeric/bool/date inner types to native Grafana field types, and unknown inner types
// fall through to the JSON catch-all.
func TestSimpleAggregateFunctionNativeTypes(t *testing.T) {
	cases := []struct {
		name      string
		typeName  string
		fieldType data.FieldType
	}{
		{"UInt16", "SimpleAggregateFunction(any, UInt16)", data.FieldTypeUint16},
		{"Nullable(UInt16)", "SimpleAggregateFunction(any, Nullable(UInt16))", data.FieldTypeNullableUint16},
		{"Int64", "SimpleAggregateFunction(anyLast, Int64)", data.FieldTypeInt64},
		{"Float64", "SimpleAggregateFunction(any, Float64)", data.FieldTypeFloat64},
		{"Bool", "SimpleAggregateFunction(any, Bool)", data.FieldTypeBool},
		{"Nullable(Bool)", "SimpleAggregateFunction(any, Nullable(Bool))", data.FieldTypeNullableBool},
		{"DateTime64", "SimpleAggregateFunction(min, DateTime64(9))", data.FieldTypeTime},
		{"DateTime64 with timezone", "SimpleAggregateFunction(min, DateTime64(9, 'UTC'))", data.FieldTypeTime},
		{"DateTime", "SimpleAggregateFunction(any, DateTime)", data.FieldTypeTime},
		{"DateTime with timezone", "SimpleAggregateFunction(any, DateTime('Europe/London'))", data.FieldTypeTime},
		{"Date32", "SimpleAggregateFunction(any, Date32)", data.FieldTypeTime},
		{"Nullable(DateTime64)", "SimpleAggregateFunction(any, Nullable(DateTime64(9)))", data.FieldTypeNullableTime},
		{"Nullable(DateTime64 with tz)", "SimpleAggregateFunction(any, Nullable(DateTime64(9, 'UTC')))", data.FieldTypeNullableTime},
		{"Nullable(DateTime with tz)", "SimpleAggregateFunction(any, Nullable(DateTime('Asia/Tokyo')))", data.FieldTypeNullableTime},
		{"Nullable(Date32)", "SimpleAggregateFunction(any, Nullable(Date32))", data.FieldTypeNullableTime},
		{"Array(String) falls to catch-all", "SimpleAggregateFunction(any, Array(String))", data.FieldTypeJSON},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sut := findByRegex(tc.typeName)
			require.NotNil(t, sut.InputScanType, "converter not found for %s", tc.typeName)
			assert.Equal(t, tc.fieldType, sut.FrameConverter.FieldType)
		})
	}
}

// TestSimpleAggregateFunctionNativeConverterValues exercises the native SAF converter
// funcs, including the driver inconsistency where a value may arrive bare or as a pointer.
func TestSimpleAggregateFunctionNativeConverterValues(t *testing.T) {
	u := uint16(200)
	f := float64(3.14)
	b := true
	ts := time.Date(2026, 6, 24, 10, 0, 0, 0, time.UTC)

	cases := []struct {
		name     string
		typeName string
		in       any
		want     any
	}{
		{"UInt16 value", "SimpleAggregateFunction(any, UInt16)", any(uint16(200)), uint16(200)},
		{"UInt16 pointer form", "SimpleAggregateFunction(any, UInt16)", any(&u), uint16(200)},
		{"Nullable(UInt16) value", "SimpleAggregateFunction(any, Nullable(UInt16))", any(&u), &u},
		{"Nullable(UInt16) bare value", "SimpleAggregateFunction(any, Nullable(UInt16))", any(uint16(42)), ref(uint16(42))},
		{"Nullable(UInt16) nil", "SimpleAggregateFunction(any, Nullable(UInt16))", nil, (*uint16)(nil)},
		{"Float64 value", "SimpleAggregateFunction(any, Float64)", any(float64(3.14)), float64(3.14)},
		{"Float64 pointer form", "SimpleAggregateFunction(any, Float64)", any(&f), float64(3.14)},
		{"Nullable(Float64) bare value", "SimpleAggregateFunction(any, Nullable(Float64))", any(float64(9.81)), ref(9.81)},
		{"Bool value", "SimpleAggregateFunction(any, Bool)", any(true), true},
		{"Bool pointer form", "SimpleAggregateFunction(any, Bool)", any(&b), true},
		{"Nullable(Bool) bare value", "SimpleAggregateFunction(any, Nullable(Bool))", any(true), ref(true)},
		{"DateTime value", "SimpleAggregateFunction(min, DateTime64(9))", any(ts), ts},
		{"DateTime pointer form", "SimpleAggregateFunction(min, DateTime64(9))", any(&ts), ts},
		{"Nullable(DateTime) bare value", "SimpleAggregateFunction(any, Nullable(DateTime64(9)))", any(ts), &ts},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sut := findByRegex(tc.typeName)
			require.NotNil(t, sut.InputScanType, "converter not found for %s", tc.typeName)
			in := tc.in
			v, err := sut.FrameConverter.ConverterFunc(&in)
			assert.Nil(t, err)
			assert.Equal(t, tc.want, v)
		})
	}
}

// TestSimpleAggregateFunctionGetConverter covers the GetConverter path, which extracts
// the inner type and delegates to the typed converter.
func TestSimpleAggregateFunctionGetConverter(t *testing.T) {
	cases := []struct {
		name      string
		typeName  string
		fieldType data.FieldType
	}{
		{"String", "SimpleAggregateFunction(any, String)", data.FieldTypeString},
		{"Nullable(String)", "SimpleAggregateFunction(any, Nullable(String))", data.FieldTypeNullableString},
		{"Nullable(UInt16)", "SimpleAggregateFunction(any, Nullable(UInt16))", data.FieldTypeNullableUint16},
		{"Int64", "SimpleAggregateFunction(anyLast, Int64)", data.FieldTypeInt64},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sut := GetConverter(tc.typeName)
			require.NotNil(t, sut.InputScanType)
			assert.Equal(t, tc.fieldType, sut.FrameConverter.FieldType)
		})
	}
}

// TestSAFConvertUnexpectedType covers the error branch of the generic SAF converters.
func TestSAFConvertUnexpectedType(t *testing.T) {
	var in any = "not a number"

	_, err := safConvert[int64](&in)
	assert.Error(t, err)

	_, err = safConvertNullable[int64](&in)
	assert.Error(t, err)
}
