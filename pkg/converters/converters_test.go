package converters

import (
	"encoding/json"
	"errors"
	"math/big"
	"net"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDate(t *testing.T) {
	layout := "2006-01-02T15:04:05.000Z"
	str := "2014-11-12T11:45:26.371Z"
	d, _ := time.Parse(layout, str)
	sut := GetConverter("Date")
	v, err := sut.FrameConverter.ConverterFunc(&d)
	assert.Nil(t, err)
	actual := v.(time.Time)
	assert.Equal(t, d, actual)
}

func TestNullableDate(t *testing.T) {
	layout := "2006-01-02T15:04:05.000Z"
	str := "2014-11-12T11:45:26.371Z"
	d, _ := time.Parse(layout, str)
	val := &d
	sut := GetConverter("Nullable(Date)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, val, actual)
}

func TestNullableDateShouldBeNil(t *testing.T) {
	sut := GetConverter("Nullable(Date)")
	var d *time.Time
	v, err := sut.FrameConverter.ConverterFunc(&d)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, (*time.Time)(nil), actual)
}

func TestNullableDecimal(t *testing.T) {
	val := decimal.New(25, 4)
	value := &val
	nullableDecimal := GetConverter("Nullable(Decimal(15,2))")
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	f, _ := val.Float64()
	assert.Equal(t, f, *actual)
}

func TestNullableDecimalShouldBeNull(t *testing.T) {
	nullableDecimal := GetConverter("Nullable(Decimal(15,2))")
	var value *decimal.Decimal
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestDecimal(t *testing.T) {
	val := decimal.New(25, 4)
	nullableDecimal := GetConverter("Decimal(15,2)")
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(float64)
	f, _ := val.Float64()
	assert.Equal(t, f, actual)
}

func TestNullableString(t *testing.T) {
	var value *string
	sut := GetConverter("Nullable(String)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value, actual)
}

func TestBool(t *testing.T) {
	value := true
	sut := GetConverter("Bool")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(bool)
	assert.True(t, actual)
}

func TestNullableBool(t *testing.T) {
	var value *bool
	sut := GetConverter("Nullable(Bool)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*bool)
	assert.Equal(t, value, actual)
}

func TestFloat64(t *testing.T) {
	value := 1.1
	sut := GetConverter("Float64")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	assert.Equal(t, value, actual)
}

func TestNullableFloat64(t *testing.T) {
	var value *float64
	sut := GetConverter("Nullable(Float64)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, value, actual)
}

func TestFloat32(t *testing.T) {
	value := 1.1
	sut := GetConverter("Float32")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	assert.Equal(t, value, actual)
}

func TestInt64(t *testing.T) {
	value := int64(1)
	sut := GetConverter("Int64")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int64)
	assert.Equal(t, value, actual)
}

func TestNullableInt64(t *testing.T) {
	var value *int64
	sut := GetConverter("Nullable(Int64)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int64)
	assert.Equal(t, value, actual)
}

func TestInt32(t *testing.T) {
	value := int32(1)
	sut := GetConverter("Int32")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int32)
	assert.Equal(t, value, actual)
}

func TestNullableInt32(t *testing.T) {
	var value *int32
	sut := GetConverter("Nullable(Int32)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int32)
	assert.Equal(t, value, actual)
}

func TestInt8(t *testing.T) {
	value := int8(1)
	sut := GetConverter("Int8")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int8)
	assert.Equal(t, value, actual)
}

func TestNullableInt8(t *testing.T) {
	var value *int8
	sut := GetConverter("Nullable(Int8)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int8)
	assert.Equal(t, value, actual)
}

func TestInt16(t *testing.T) {
	value := int16(1)
	sut := GetConverter("Int16")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int16)
	assert.Equal(t, value, actual)
}

func TestNullableInt16(t *testing.T) {
	var value *int16
	sut := GetConverter("Nullable(Int16)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int16)
	assert.Equal(t, value, actual)
}

func TestUInt8(t *testing.T) {
	value := uint8(1)
	sut := GetConverter("UInt8")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(uint8)
	assert.Equal(t, value, actual)
}

func TestNullableUInt8(t *testing.T) {
	value := uint8(100)
	val := &value
	sut := GetConverter("Nullable(UInt8)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint8)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt8ShouldBeNil(t *testing.T) {
	var value *uint8
	val := &value
	sut := GetConverter("Nullable(UInt8)")
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint8)
	assert.Equal(t, value, actual)
}

func TestUInt16(t *testing.T) {
	value := uint16(100)
	val := &value
	sut := GetConverter("UInt16")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt16(t *testing.T) {
	value := uint16(100)
	val := &value
	sut := GetConverter("Nullable(UInt16)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt16ShouldBeNil(t *testing.T) {
	var value *uint16
	val := &value
	sut := GetConverter("Nullable(UInt16)")
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, actual)
}

func TestUInt32(t *testing.T) {
	value := uint32(100)
	val := &value
	sut := GetConverter("UInt32")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt32(t *testing.T) {
	value := uint32(100)
	val := &value
	sut := GetConverter("Nullable(UInt32)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt32ShouldBeNil(t *testing.T) {
	var value *uint32
	val := &value
	sut := GetConverter("Nullable(UInt32)")
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, actual)
}

func TestUInt64(t *testing.T) {
	value := uint64(100)
	val := &value
	sut := GetConverter("UInt64")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt64(t *testing.T) {
	value := uint64(100)
	val := &value
	sut := GetConverter("Nullable(UInt64)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt64ShouldBeNil(t *testing.T) {
	var value *uint64
	val := &value
	sut := GetConverter("Nullable(UInt64)")
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, actual)
}

func TestInt128(t *testing.T) {
	value := big.NewInt(128)
	sut := GetConverter("Int128")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableInt128(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := GetConverter("Nullable(Int128)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableInt128ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := GetConverter("Nullable(Int128)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestInt256(t *testing.T) {
	value := big.NewInt(128)
	sut := GetConverter("Int256")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableInt256(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := GetConverter("Nullable(Int256)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableInt256ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := GetConverter("Nullable(Int256)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestUInt128(t *testing.T) {
	value := big.NewInt(128)
	sut := GetConverter("UInt128")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableUInt128(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := GetConverter("Nullable(UInt128)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableUInt128ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := GetConverter("Nullable(UInt128)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestUInt256(t *testing.T) {
	value := big.NewInt(128)
	sut := GetConverter("UInt256")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableUInt256(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := GetConverter("Nullable(UInt256)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableUInt256ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := GetConverter("Nullable(UInt256)")
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
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

func TestTuple(t *testing.T) {
	value := map[string]interface{}{
		"1": uint16(1),
		"2": uint16(2),
		"3": uint16(3),
		"4": uint16(4),
	}
	sut := GetConverter("Tuple(name String, id Uint16)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestNested(t *testing.T) {
	value := []map[string]interface{}{
		{
			"1": uint16(1),
			"2": uint16(2),
			"3": uint16(3),
			"4": uint16(4),
		},
	}
	sut := GetConverter("Nested(name String, id Uint16)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestMap(t *testing.T) {
	value := map[string]interface{}{
		"1": uint16(1),
		"2": uint16(2),
		"3": uint16(3),
		"4": uint16(4),
	}
	sut := GetConverter("Map(String, Uint16)")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestJSONObject(t *testing.T) {
	value := clickhouse.NewJSON()
	value.SetValueAtPath("x", "1234")

	sut := GetConverter("JSON")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestJSONString(t *testing.T) {
	jsonStr := `{"x":"1234"}`
	value := []byte(jsonStr)
	sut := GetConverter("JSON")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Nil(t, err)
	assert.Equal(t, json.RawMessage(jsonStr), v.(json.RawMessage))
}

func TestNullableFixedString(t *testing.T) {
	value := "2"
	sut := GetConverter("Nullable(FixedString(2))")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Equal(t, value, v.(string))
}

func TestArray(t *testing.T) {
	value := []string{"1", "2", "3"}
	ipConverter := GetConverter("Array(String)")
	v, err := ipConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestIPv4(t *testing.T) {
	value := net.ParseIP("127.0.0.1")
	ipConverter := GetConverter("IPv4")
	v, err := ipConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Equal(t, value.String(), v)
}

func TestIPv6(t *testing.T) {
	value := net.ParseIP("2001:44c8:129:2632:33:0:252:2")
	ipConverter := GetConverter("IPv6")
	v, err := ipConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Equal(t, value.String(), v)
}

func TestNullableIPv4(t *testing.T) {
	value := net.ParseIP("127.0.0.1")
	val := &value
	ipConverter := GetConverter("Nullable(IPv4)")
	v, err := ipConverter.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value.String(), *actual)
}

func TestNullableIPv4ShouldBeNull(t *testing.T) {
	var value *net.IP
	ipConverter := GetConverter("Nullable(IPv4)")
	v, err := ipConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	require.Nil(t, v)
}

func TestNullableIPv6(t *testing.T) {
	value := net.ParseIP("2001:44c8:129:2632:33:0:252:2")
	val := &value
	ipConverter := GetConverter("Nullable(IPv6)")
	v, err := ipConverter.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value.String(), *actual)
}

func TestNullableIPv6ShouldBeNull(t *testing.T) {
	var value *net.IP
	ipConverter := GetConverter("Nullable(IPv6)")
	v, err := ipConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	require.Nil(t, v)
}

func TestSimpleAggregateFunction(t *testing.T) {
	value := [][]int{{1, 2, 3}, {1, 2, 3}}
	aggConverter := GetConverter("SimpleAggregateFunction()")
	v, err := aggConverter.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestPoint(t *testing.T) {
	value := interface{}(interface{}(orb.Point{10, 10}))
	sut := GetConverter("Point")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	msg, err := toJson(value)
	assert.Nil(t, err)
	assert.Equal(t, msg, v.(json.RawMessage))
}

func TestLowCardinality(t *testing.T) {
	value := "value"
	sut := GetConverter("LowCardinality(String)")
	v, err := sut.FrameConverter.ConverterFunc(value)
	assert.Nil(t, err)
	assert.Equal(t, value, v)
}

func TestLowCardinalityNullable(t *testing.T) {
	value := "value"
	sut := GetConverter("LowCardinality(Nullable(String))")
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Equal(t, value, v)
}

func TestExtractLowCardinality(t *testing.T) {
	cases := []struct {
		inputType    string
		expectedType string
		expectedOk   bool
	}{
		{
			inputType:    "Nullable(LowCardinality(String))",
			expectedType: "",
			expectedOk:   false,
		},
		{
			inputType:    "String",
			expectedType: "",
			expectedOk:   false,
		},
		{
			inputType:    "LowCardinality(String)",
			expectedType: "String",
			expectedOk:   true,
		},
		{
			inputType:    "LowCardinality(Nullable(String))",
			expectedType: "Nullable(String)",
			expectedOk:   true,
		},
	}

	for _, c := range cases {
		t.Run(c.inputType, func(t *testing.T) {
			actualType, actualOk := extractLowCardinalityType(c.inputType)
			assert.Equal(t, c.expectedOk, actualOk)
			assert.Equal(t, c.expectedType, actualType)
		})
	}
}
