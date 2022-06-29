package converters_test

import (
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/stretchr/testify/assert"
)

func TestNullableDate(t *testing.T) {
	layout := "2006-01-02T15:04:05.000Z"
	str := "2014-11-12T11:45:26.371Z"
	d, _ := time.Parse(layout, str)
	sut := converters.NullableDateConverter()
	mock := sql.NullTime{
		Time:  d,
		Valid: true,
	}
	v, err := sut.FrameConverter.ConverterFunc(&mock)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, &d, actual)
}

func TestNullableDateShouldBeNil(t *testing.T) {
	sut := converters.NullableDateConverter()
	v, err := sut.FrameConverter.ConverterFunc(nil)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, (*time.Time)(nil), actual)
}

func TestNullableDecimal(t *testing.T) {
	val := float64(123)
	value := floatToRawBytes(val)
	col := sql.ColumnType{}
	nullableDecimal := converters.NullableDecimalConverter()
	v, err := nullableDecimal.FrameConverter.ConvertWithColumn(&value, col)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, val, *actual)
}

func TestNullableString(t *testing.T) {
	value := sql.NullString{String: "foo", Valid: true}
	sut := converters.NullableStringConverter()
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value.String, *actual)
}

func TestNullableStringNotValid(t *testing.T) {
	value := sql.NullString{String: "foo", Valid: false}
	sut := converters.NullableStringConverter()
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	assert.Nil(t, v)
}

func floatToRawBytes(val float64) sql.RawBytes {
	raw := []byte(fmt.Sprintf("%f", val))
	value := sql.RawBytes{}
	for _, v := range raw {
		value = append(value, v)
	}
	return value
}

func TestNullableUInt8(t *testing.T) {
	value := uint8(100)
	val := &value
	sut := converters.CreateConverter("UInt8", converters.Types["UInt8"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint8)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt16(t *testing.T) {
	value := uint16(100)
	val := &value
	sut := converters.CreateConverter("UInt8", converters.Types["UInt16"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint16)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt32(t *testing.T) {
	value := uint32(100)
	val := &value
	sut := converters.CreateConverter("UInt8", converters.Types["UInt32"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint32)
	assert.Equal(t, value, *actual)
}

func TestNullableUInt64(t *testing.T) {
	value := uint64(100)
	val := &value
	sut := converters.CreateConverter("UInt8", converters.Types["UInt64"])
	v, err := sut.FrameConverter.ConverterFunc(&val)
	assert.Nil(t, err)
	actual := v.(*uint64)
	assert.Equal(t, value, *actual)
}
