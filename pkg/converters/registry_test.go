package converters

import (
	"encoding/json"
	"math/big"
	"net"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestConverterFieldTypes verifies GetConverter resolves each ClickHouse column type
// to a converter with the expected Grafana field type (exercises the whole registry
// including the LowCardinality/SAF delegation in GetConverter).
func TestConverterFieldTypes(t *testing.T) {
	cases := []struct {
		columnType string
		fieldType  data.FieldType
	}{
		{"String", data.FieldTypeString},
		{"Nullable(String)", data.FieldTypeNullableString},
		{"Bool", data.FieldTypeBool},
		{"Nullable(Bool)", data.FieldTypeNullableBool},
		{"Float32", data.FieldTypeFloat32},
		{"Float64", data.FieldTypeFloat64},
		{"Nullable(Float32)", data.FieldTypeNullableFloat32},
		{"Nullable(Float64)", data.FieldTypeNullableFloat64},
		{"Int8", data.FieldTypeInt8},
		{"Int16", data.FieldTypeInt16},
		{"Int32", data.FieldTypeInt32},
		{"Int64", data.FieldTypeInt64},
		{"Nullable(Int8)", data.FieldTypeNullableInt8},
		{"Nullable(Int16)", data.FieldTypeNullableInt16},
		{"Nullable(Int32)", data.FieldTypeNullableInt32},
		{"Nullable(Int64)", data.FieldTypeNullableInt64},
		{"UInt8", data.FieldTypeUint8},
		{"UInt16", data.FieldTypeUint16},
		{"UInt32", data.FieldTypeUint32},
		{"UInt64", data.FieldTypeUint64},
		{"Nullable(UInt8)", data.FieldTypeNullableUint8},
		{"Nullable(UInt16)", data.FieldTypeNullableUint16},
		{"Nullable(UInt32)", data.FieldTypeNullableUint32},
		{"Nullable(UInt64)", data.FieldTypeNullableUint64},
		{"Int128", data.FieldTypeFloat64},
		{"Int256", data.FieldTypeFloat64},
		{"UInt128", data.FieldTypeFloat64},
		{"UInt256", data.FieldTypeFloat64},
		{"Nullable(Int128)", data.FieldTypeNullableFloat64},
		{"Nullable(Int256)", data.FieldTypeNullableFloat64},
		{"Nullable(UInt128)", data.FieldTypeNullableFloat64},
		{"Nullable(UInt256)", data.FieldTypeNullableFloat64},
		{"Date", data.FieldTypeTime},
		{"Nullable(Date)", data.FieldTypeNullableTime},
		{"Decimal(15,2)", data.FieldTypeFloat64},
		{"Nullable(Decimal(15,2))", data.FieldTypeNullableFloat64},
		{"Enum8('a' = 1)", data.FieldTypeString},
		{"Enum16('a' = 1000)", data.FieldTypeString},
		{"Nullable(Enum8('a' = 1))", data.FieldTypeNullableString},
		{"Nullable(Enum16('a' = 1000))", data.FieldTypeNullableString},
		{"Tuple(a String)", data.FieldTypeJSON},
		{"Nested(a String)", data.FieldTypeJSON},
		{"Map(String, UInt16)", data.FieldTypeJSON},
		{"JSON", data.FieldTypeJSON},
		{"Nullable(JSON)", data.FieldTypeJSON},
		{"Array(String)", data.FieldTypeJSON},
		{"Variant(String)", data.FieldTypeJSON},
		{"Dynamic", data.FieldTypeJSON},
		{"Nullable(FixedString(2))", data.FieldTypeNullableString},
		{"IPv4", data.FieldTypeString},
		{"IPv6", data.FieldTypeString},
		{"Nullable(IPv4)", data.FieldTypeNullableString},
		{"Nullable(IPv6)", data.FieldTypeNullableString},
		{"Point", data.FieldTypeJSON},
		{"LowCardinality(String)", data.FieldTypeString},
		{"LowCardinality(Nullable(String))", data.FieldTypeNullableString},
	}
	for _, c := range cases {
		t.Run(c.columnType, func(t *testing.T) {
			sut := GetConverter(c.columnType)
			require.NotNil(t, sut.InputScanType, "converter not found for %s", c.columnType)
			assert.Equal(t, c.fieldType, sut.FrameConverter.FieldType)
		})
	}
}

// TestScalarValueRoundTrip covers the non-nullable numeric/bool converters. Input
// pointer depth mirrors what the driver hands each converter.
func TestScalarValueRoundTrip(t *testing.T) {
	cases := []struct {
		columnType string
		in         any
		want       any
	}{
		{"Bool", ref(true), true},
		{"Float64", ref(1.1), 1.1},
		{"Float32", ref(1.1), 1.1},
		{"Int8", ref(int8(1)), int8(1)},
		{"Int16", ref(int16(1)), int16(1)},
		{"Int32", ref(int32(1)), int32(1)},
		{"Int64", ref(int64(1)), int64(1)},
		{"UInt8", ref(uint8(1)), uint8(1)},
		{"UInt16", ref(ref(uint16(100))), ref(uint16(100))},
		{"UInt32", ref(ref(uint32(100))), ref(uint32(100))},
		{"UInt64", ref(ref(uint64(100))), ref(uint64(100))},
		{"Int128", ref(big.NewInt(128)), bigFloat(128)},
		{"Int256", ref(big.NewInt(128)), bigFloat(128)},
		{"UInt128", ref(big.NewInt(128)), bigFloat(128)},
		{"UInt256", ref(big.NewInt(128)), bigFloat(128)},
	}
	for _, c := range cases {
		t.Run(c.columnType, func(t *testing.T) {
			assert.Equal(t, c.want, runConverter(t, c.columnType, c.in))
		})
	}
}

// TestNullableValueRoundTrip covers the Nullable(...) numeric/bool converters for both
// present and NULL values.
func TestNullableValueRoundTrip(t *testing.T) {
	cases := []struct {
		name       string
		columnType string
		in         any
		want       any
	}{
		// present values (**T -> *T)
		{"UInt8", "Nullable(UInt8)", ref(ref(uint8(100))), ref(uint8(100))},
		{"UInt16", "Nullable(UInt16)", ref(ref(uint16(100))), ref(uint16(100))},
		{"UInt32", "Nullable(UInt32)", ref(ref(uint32(100))), ref(uint32(100))},
		{"UInt64", "Nullable(UInt64)", ref(ref(uint64(100))), ref(uint64(100))},
		{"Int64", "Nullable(Int64)", ref(ref(int64(7))), ref(int64(7))},
		{"Float64", "Nullable(Float64)", ref(ref(3.5)), ref(3.5)},
		{"Float32", "Nullable(Float32)", ref(ref(float32(2.5))), ref(float32(2.5))},
		{"Bool", "Nullable(Bool)", ref(ref(true)), ref(true)},
		// NULL values (**T -> typed nil *T)
		{"UInt8 nil", "Nullable(UInt8)", ref((*uint8)(nil)), (*uint8)(nil)},
		{"UInt16 nil", "Nullable(UInt16)", ref((*uint16)(nil)), (*uint16)(nil)},
		{"UInt32 nil", "Nullable(UInt32)", ref((*uint32)(nil)), (*uint32)(nil)},
		{"UInt64 nil", "Nullable(UInt64)", ref((*uint64)(nil)), (*uint64)(nil)},
		{"Int8 nil", "Nullable(Int8)", ref((*int8)(nil)), (*int8)(nil)},
		{"Int16 nil", "Nullable(Int16)", ref((*int16)(nil)), (*int16)(nil)},
		{"Int32 nil", "Nullable(Int32)", ref((*int32)(nil)), (*int32)(nil)},
		{"Int64 nil", "Nullable(Int64)", ref((*int64)(nil)), (*int64)(nil)},
		{"Float64 nil", "Nullable(Float64)", ref((*float64)(nil)), (*float64)(nil)},
		{"Bool nil", "Nullable(Bool)", ref((*bool)(nil)), (*bool)(nil)},
		// big integers (***big.Int -> *float64)
		{"Int128", "Nullable(Int128)", ref(ref(big.NewInt(128))), ref(bigFloat(128))},
		{"Int256", "Nullable(Int256)", ref(ref(big.NewInt(128))), ref(bigFloat(128))},
		{"UInt128", "Nullable(UInt128)", ref(ref(big.NewInt(128))), ref(bigFloat(128))},
		{"UInt256", "Nullable(UInt256)", ref(ref(big.NewInt(128))), ref(bigFloat(128))},
		{"Int128 nil", "Nullable(Int128)", ref(ref((*big.Int)(nil))), (*float64)(nil)},
		{"Int256 nil", "Nullable(Int256)", ref(ref((*big.Int)(nil))), (*float64)(nil)},
		{"UInt128 nil", "Nullable(UInt128)", ref(ref((*big.Int)(nil))), (*float64)(nil)},
		{"UInt256 nil", "Nullable(UInt256)", ref(ref((*big.Int)(nil))), (*float64)(nil)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, runConverter(t, c.columnType, c.in))
		})
	}
}

// TestJSONValueConverters covers the JSON-shaped types that render via jsonConverter.
func TestJSONValueConverters(t *testing.T) {
	mapVal := map[string]interface{}{"1": uint16(1), "2": uint16(2), "3": uint16(3), "4": uint16(4)}

	jsonObj := clickhouse.NewJSON()
	jsonObj.SetValueAtPath("x", "1234")

	cases := []struct {
		name       string
		columnType string
		value      any
	}{
		{"Tuple", "Tuple(name String, id UInt16)", mapVal},
		{"Map", "Map(String, UInt16)", mapVal},
		{"Nested", "Nested(name String, id UInt16)", []map[string]interface{}{mapVal}},
		{"JSON object", "JSON", jsonObj},
		{"Array", "Array(String)", []string{"1", "2", "3"}},
		{"Point", "Point", any(orb.Point{10, 10})},
		{"Variant", "Variant(String)", mapVal},
		{"Dynamic", "Dynamic", mapVal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			want, err := toJson(tc.value)
			require.NoError(t, err)
			got := runConverter(t, tc.columnType, ref(tc.value))
			assert.Equal(t, want, got.(json.RawMessage))
		})
	}
}

// TestJSONStringConverter covers the JSON passthrough path where the driver already
// provides encoded bytes.
func TestJSONStringConverter(t *testing.T) {
	jsonStr := `{"x":"1234"}`
	value := []byte(jsonStr)
	got := runConverter(t, "JSON", &value)
	assert.Equal(t, json.RawMessage(jsonStr), got.(json.RawMessage))
}

func TestDateConverters(t *testing.T) {
	d, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")

	t.Run("Date", func(t *testing.T) {
		assert.Equal(t, d, runConverter(t, "Date", &d))
	})
	t.Run("Nullable(Date)", func(t *testing.T) {
		assert.Equal(t, &d, runConverter(t, "Nullable(Date)", ref(&d)))
	})
	t.Run("Nullable(Date) nil", func(t *testing.T) {
		assert.Equal(t, (*time.Time)(nil), runConverter(t, "Nullable(Date)", ref((*time.Time)(nil))))
	})
}

func TestDecimalConverters(t *testing.T) {
	val := decimal.New(25, 4)
	f, _ := val.Float64()

	t.Run("Decimal", func(t *testing.T) {
		assert.Equal(t, f, runConverter(t, "Decimal(15,2)", &val))
	})
	t.Run("Nullable(Decimal)", func(t *testing.T) {
		assert.Equal(t, &f, runConverter(t, "Nullable(Decimal(15,2))", ref(&val)))
	})
	t.Run("Nullable(Decimal) nil", func(t *testing.T) {
		assert.Equal(t, (*float64)(nil), runConverter(t, "Nullable(Decimal(15,2))", ref((*decimal.Decimal)(nil))))
	})
}

func TestEnumConverters(t *testing.T) {
	enum8 := "Enum8('WRITABLE' = 0, 'CONST' = 1, 'CHANGEABLE_IN_READONLY' = 2)"
	enum16 := "Enum16('option1' = 1000, 'option2' = 2000)"
	value := "CONST"

	t.Run("Enum8", func(t *testing.T) {
		assert.Equal(t, value, runConverter(t, enum8, &value))
	})
	t.Run("Enum16", func(t *testing.T) {
		v := "option1"
		assert.Equal(t, v, runConverter(t, enum16, &v))
	})
	t.Run("Nullable(Enum8)", func(t *testing.T) {
		assert.Equal(t, &value, runConverter(t, "Nullable("+enum8+")", ref(&value)))
	})
	t.Run("Nullable(Enum8) nil", func(t *testing.T) {
		assert.Equal(t, (*string)(nil), runConverter(t, "Nullable("+enum8+")", ref((*string)(nil))))
	})
	t.Run("Nullable(Enum16)", func(t *testing.T) {
		v := "option1"
		assert.Equal(t, &v, runConverter(t, "Nullable("+enum16+")", ref(&v)))
	})
	t.Run("Nullable(Enum16) nil", func(t *testing.T) {
		assert.Equal(t, (*string)(nil), runConverter(t, "Nullable("+enum16+")", ref((*string)(nil))))
	})
}

func TestIPConverters(t *testing.T) {
	v4 := net.ParseIP("127.0.0.1")
	v6 := net.ParseIP("2001:44c8:129:2632:33:0:252:2")

	t.Run("IPv4", func(t *testing.T) {
		assert.Equal(t, v4.String(), runConverter(t, "IPv4", &v4))
	})
	t.Run("IPv6", func(t *testing.T) {
		assert.Equal(t, v6.String(), runConverter(t, "IPv6", &v6))
	})
	t.Run("Nullable(IPv4)", func(t *testing.T) {
		assert.Equal(t, v4.String(), *runConverter(t, "Nullable(IPv4)", ref(&v4)).(*string))
	})
	t.Run("Nullable(IPv6)", func(t *testing.T) {
		assert.Equal(t, v6.String(), *runConverter(t, "Nullable(IPv6)", ref(&v6)).(*string))
	})
	t.Run("Nullable(IPv4) nil", func(t *testing.T) {
		assert.Nil(t, runConverter(t, "Nullable(IPv4)", ref((*net.IP)(nil))))
	})
	t.Run("Nullable(IPv6) nil", func(t *testing.T) {
		assert.Nil(t, runConverter(t, "Nullable(IPv6)", ref((*net.IP)(nil))))
	})
}

func TestStringConverters(t *testing.T) {
	t.Run("Nullable(String) nil", func(t *testing.T) {
		assert.Equal(t, (*string)(nil), runConverter(t, "Nullable(String)", ref((*string)(nil))))
	})
	t.Run("Nullable(FixedString)", func(t *testing.T) {
		value := "2"
		assert.Equal(t, value, runConverter(t, "Nullable(FixedString(2))", &value))
	})
	t.Run("LowCardinality(String)", func(t *testing.T) {
		value := "value"
		// LowCardinality delegates to the String converter, which handles a bare string.
		assert.Equal(t, value, runConverter(t, "LowCardinality(String)", value))
	})
	t.Run("LowCardinality(Nullable(String))", func(t *testing.T) {
		value := "value"
		assert.Equal(t, value, runConverter(t, "LowCardinality(Nullable(String))", &value))
	})
}
