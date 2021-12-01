package converters_test

import (
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/stretchr/testify/assert"
)

func TestConverters(t *testing.T) {
	conv := converters.ClickHouseConverters()
	types := converters.NumericTypes()
	types = append(types, converters.WILDCARD_TYPES...)
	for _, c := range conv {
		contains := false
		for _, v := range types {
			if strings.Contains(c.InputTypeName, v) {
				contains = true
				break
			}
		}
		assert.True(t, contains)
	}
	assert.Equal(t, 24, len(conv))
}

func TestNullableDate(t *testing.T) {
	layout := "2006-01-02T15:04:05.000Z"
	str := "2014-11-12T11:45:26.371Z"
	d, _ := time.Parse(layout, str)
	sut := converters.NullableDate()
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
	sut := converters.NullableDate()
	v, err := sut.FrameConverter.ConverterFunc(nil)
	assert.Nil(t, err)
	actual := v.(*time.Time)
	assert.Equal(t, (*time.Time)(nil), actual)
}

func TestNullableDecimal(t *testing.T) {
	val := float64(123)
	value := floatToRawBytes(val)
	col := sql.ColumnType{}
	nullableDecimal := converters.NullableDecimal()
	v, err := nullableDecimal.FrameConverter.ConvertWithColumn(&value, col)
	assert.Nil(t, err)
	actual := v.(*float64)
	assert.Equal(t, val, *actual)
}

func TestNullableString(t *testing.T) {
	value := sql.NullString{String: "foo", Valid: true}
	sut := converters.NullableString()
	v, err := sut.FrameConverter.ConverterFunc(&value)
	assert.Nil(t, err)
	actual := v.(*string)
	assert.Equal(t, value.String, *actual)
}

func TestNullableStringNotValid(t *testing.T) {
	value := sql.NullString{String: "foo", Valid: false}
	sut := converters.NullableString()
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
