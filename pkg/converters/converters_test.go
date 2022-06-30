package converters_test

import (
	"encoding/json"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"math/big"
	"testing"
	"time"
)

func TestDate(t *testing.T) {
	layout := "2006-01-02T15:04:05.000Z"
	str := "2014-11-12T11:45:26.371Z"
	d, _ := time.Parse(layout, str)
	sut := converters.CreateConverter("Date", converters.Types["Date"])
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
	sut := converters.CreateConverter("Nullable(Date)", converters.Types["Nullable(Date)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, val, actual)
}

func TestNullableDateShouldBeNil(t *testing.T) {
	sut := converters.CreateConverter("Nullable(Date)", converters.Types["Nullable(Date)"])
	var d *time.Time
	v, err := sut.FrameConverter.ConverterFunc(&d)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, (*time.Time)(nil), actual)
}

func TestNullableDecimal(t *testing.T) {
	val := decimal.New(25, 4)
	value := &val
	nullableDecimal := converters.CreateConverter("Nullable(Decimal)", converters.Types["Nullable(Decimal)"])
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	f, _ := val.Float64()
	assert.Equal(t, f, *actual)
}

func TestNullableDecimalShouldBeNull(t *testing.T) {
	nullableDecimal := converters.CreateConverter("Nullable(Decimal)", converters.Types["Nullable(Decimal)"])
	var value *decimal.Decimal
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestDecimal(t *testing.T) {
	val := decimal.New(25, 4)
	nullableDecimal := converters.CreateConverter("Decimal", converters.Types["Decimal"])
	v, err := nullableDecimal.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(float64)
	f, _ := val.Float64()
	assert.Equal(t, f, actual)
}

func TestNullableString(t *testing.T) {
	var value *string
	sut := converters.CreateConverter("Nullable(String)", converters.Types["Nullable(String)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value, actual)
}

func TestBool(t *testing.T) {
	value := true
	sut := converters.CreateConverter("Bool", converters.Types["Bool"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(bool)
	assert.True(t, actual)
}

func TestNullableBool(t *testing.T) {
	var value *bool
	sut := converters.CreateConverter("Nullable(Bool)", converters.Types["Nullable(Bool)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*bool)
	assert.Equal(t, value, actual)
}

func TestFloat64(t *testing.T) {
	value := 1.1
	sut := converters.CreateConverter("Float64", converters.Types["Float64"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	assert.Equal(t, value, actual)
}

func TestNullableFloat64(t *testing.T) {
	var value *float64
	sut := converters.CreateConverter("Nullable(Float64)", converters.Types["Nullable(Float64)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, value, actual)
}

func TestFloat32(t *testing.T) {
	value := 1.1
	sut := converters.CreateConverter("Float64", converters.Types["Float64"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	assert.Equal(t, value, actual)
}

func TestInt64(t *testing.T) {
	value := int64(1)
	sut := converters.CreateConverter("Int64", converters.Types["Int64"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int64)
	assert.Equal(t, value, actual)
}

func TestNullableInt64(t *testing.T) {
	var value *int64
	sut := converters.CreateConverter("Nullable(Int64)", converters.Types["Nullable(Int64)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int64)
	assert.Equal(t, value, actual)
}

func TestInt32(t *testing.T) {
	value := int32(1)
	sut := converters.CreateConverter("Int32", converters.Types["Int32"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int32)
	assert.Equal(t, value, actual)
}

func TestNullableInt32(t *testing.T) {
	var value *int32
	sut := converters.CreateConverter("Nullable(Int32)", converters.Types["Nullable(Int32)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int32)
	assert.Equal(t, value, actual)
}

func TestInt8(t *testing.T) {
	value := int8(1)
	sut := converters.CreateConverter("Int8", converters.Types["Int8"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int8)
	assert.Equal(t, value, actual)
}

func TestNullableInt8(t *testing.T) {
	var value *int8
	sut := converters.CreateConverter("Nullable(Int8)", converters.Types["Nullable(Int8)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int8)
	assert.Equal(t, value, actual)
}

func TestInt16(t *testing.T) {
	value := int16(1)
	sut := converters.CreateConverter("Int16", converters.Types["Int16"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(int16)
	assert.Equal(t, value, actual)
}

func TestNullableInt16(t *testing.T) {
	var value *int16
	sut := converters.CreateConverter("Nullable(Int16)", converters.Types["Nullable(Int16)"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*int16)
	assert.Equal(t, value, actual)
}

func TestUInt8(t *testing.T) {
	value := uint8(1)
	sut := converters.CreateConverter("UInt8", converters.Types["UInt8"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(uint8)
	assert.Equal(t, value, actual)
}

func TestNullableUInt8(t *testing.T) {
	value := uint8(100)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt8)", converters.Types["Nullable(UInt8)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint8)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt8ShouldBeNil(t *testing.T) {
	var value *uint8
	val := &value
	sut := converters.CreateConverter("Nullable(UInt8)", converters.Types["Nullable(UInt8)"])
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint8)
	assert.Equal(t, value, actual)
}

func TestUInt16(t *testing.T) {
	value := uint16(100)
	val := &value
	sut := converters.CreateConverter("UInt16", converters.Types["UInt16"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt16(t *testing.T) {
	value := uint16(100)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt16)", converters.Types["Nullable(UInt16)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt16ShouldBeNil(t *testing.T) {
	var value *uint16
	val := &value
	sut := converters.CreateConverter("Nullable(UInt16)", converters.Types["Nullable(UInt16)"])
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, actual)
}

func TestUInt32(t *testing.T) {
	value := uint32(100)
	val := &value
	sut := converters.CreateConverter("UInt32", converters.Types["UInt32"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt32(t *testing.T) {
	value := uint32(100)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt32)", converters.Types["Nullable(UInt32)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt32ShouldBeNil(t *testing.T) {
	var value *uint32
	val := &value
	sut := converters.CreateConverter("Nullable(UInt32)", converters.Types["Nullable(UInt32)"])
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, actual)
}

func TestUInt64(t *testing.T) {
	value := uint64(100)
	val := &value
	sut := converters.CreateConverter("UInt64", converters.Types["UInt64"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt64(t *testing.T) {
	value := uint64(100)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt64)", converters.Types["Nullable(UInt64)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt64ShouldBeNil(t *testing.T) {
	var value *uint64
	val := &value
	sut := converters.CreateConverter("Nullable(UInt64)", converters.Types["Nullable(UInt64)"])
	v, err := sut.FrameConverter.ConverterFunc(val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, actual)
}

func TestInt128(t *testing.T) {
	value := big.NewInt(128)
	sut := converters.CreateConverter("Int128", converters.Types["Int128"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableInt128(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := converters.CreateConverter("Nullable(Int128)", converters.Types["Nullable(Int128)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableInt128ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := converters.CreateConverter("Nullable(Int128)", converters.Types["Nullable(Int128)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestInt256(t *testing.T) {
	value := big.NewInt(128)
	sut := converters.CreateConverter("Int256", converters.Types["Int256"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableInt256(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := converters.CreateConverter("Nullable(Int256)", converters.Types["Nullable(Int256)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableInt256ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := converters.CreateConverter("Nullable(Int256)", converters.Types["Nullable(Int256)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestUInt128(t *testing.T) {
	value := big.NewInt(128)
	sut := converters.CreateConverter("UInt128", converters.Types["UInt128"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableUInt128(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt128)", converters.Types["Nullable(UInt128)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableUInt128ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := converters.CreateConverter("Nullable(UInt128)", converters.Types["Nullable(UInt128)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func TestUInt256(t *testing.T) {
	value := big.NewInt(128)
	sut := converters.CreateConverter("UInt256", converters.Types["UInt256"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, expected, actual)
}

func TestNullableUInt256(t *testing.T) {
	value := big.NewInt(128)
	val := &value
	sut := converters.CreateConverter("Nullable(UInt256)", converters.Types["Nullable(UInt256)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	expected, _ := new(big.Float).SetInt(value).Float64()
	assert.Equal(t, &expected, actual)
}

func TestNullableUInt256ShouldBeNil(t *testing.T) {
	var value *big.Int
	val := &value
	sut := converters.CreateConverter("Nullable(UInt256)", converters.Types["Nullable(UInt256)"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, (*float64)(nil), actual)
}

func toJson(obj interface{}) string {
	bytes, err := json.Marshal(obj)
	if err != nil {
		return "unable to marshal"
	}
	return string(bytes)
}

func TestTuple(t *testing.T) {
	value := map[string]interface{}{
		"1": uint16(1),
		"2": uint16(2),
		"3": uint16(3),
		"4": uint16(4),
	}
	sut := converters.CreateConverter("Tuple()", converters.Types["Tuple()"])
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.JSONEq(t, toJson(value), *v.(*string))
}

//"Nested()"
//"Array()"
//"Map()"
//"FixedString"

//IT tests against ClickHouse
