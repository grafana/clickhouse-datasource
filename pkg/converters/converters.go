package converters

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

var INT_TYPES = []string{"Int8", "Int16", "Int32", "Int64"}
var UINT_TYPES = []string{"UInt8", "UInt16", "UInt32", "UInt64", "UInt128", "UInt256"}
var INT_ALIAS = []string{"TINYINT", "BOOL", "BOOLEAN", "INT1", "SMALLINT", "INT2", "INT", "INT4", "INTEGER", "BIGINT"}
var FLOAT_TYPES = []string{"Float32", "Float64"}
var NUMERIC_TYPES = NumericTypes()
var WILDCARD_TYPES = []string{"Date", "Decimal"}
var STRING_TYPES = []string{"String"}
var CLICKHOUSE_CONVERTERS = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list = NullableNumeric()
	list = append(list, NullableDate())
	list = append(list, NullableDecimal())
	list = append(list, NullableString())
	list = append(list, ArrayConverters()...)
	return list
}

func NumericTypes() []string {
	var types []string
	types = append(types, INT_TYPES...)
	types = append(types, UINT_TYPES...)
	types = append(types, INT_ALIAS...)
	types = append(types, FLOAT_TYPES...)
	return types
}

func NullableNumeric() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, kind := range NUMERIC_TYPES {
		list = append(list, NullableFloat(kind))
	}
	return list
}

func NullableFloat(kind string) sqlutil.Converter {
	return sqlutil.Converter{
		Name:          kind,
		InputScanType: reflect.TypeOf(sql.NullFloat64{}),
		InputTypeName: fmt.Sprintf("Nullable(%s)", kind),
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeFloat64.NullableType(),
			ConverterFunc: func(in interface{}) (interface{}, error) {
				return sqlFloat64ToFloat64(in)
			},
		},
	}
}

func sqlFloat64ToFloat64(in interface{}) (interface{}, error) {
	if in == nil {
		return (*float64)(nil), nil
	}
	v := in.(*sql.NullFloat64)
	if !v.Valid {
		return (*float64)(nil), nil
	}
	f := v.Float64
	return &f, nil
}

var dateTimeMatch, _ = regexp.Compile(`^Nullable\(Date`)

func NullableDate() sqlutil.Converter {
	kind := "Nullable(DateTime)"
	return sqlutil.Converter{
		Name:           kind,
		InputScanType:  reflect.TypeOf(sql.NullTime{}),
		InputTypeRegex: dateTimeMatch,
		InputTypeName:  kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeTime.NullableType(),
			ConverterFunc: func(in interface{}) (interface{}, error) {
				if in == nil {
					return (*time.Time)(nil), nil
				}
				v := in.(*sql.NullTime)
				if !v.Valid {
					return (*time.Time)(nil), nil
				}
				f := v.Time
				return &f, nil
			},
		},
	}
}

var decimalMatch, _ = regexp.Compile(`^Nullable\(Decimal|^Decimal`)

func NullableDecimal() sqlutil.Converter {
	kind := "Nullable(Decimal)"
	return sqlutil.Converter{
		Name:           kind,
		InputScanType:  reflect.TypeOf(sql.RawBytes{}),
		InputTypeRegex: decimalMatch,
		InputTypeName:  kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeFloat64.NullableType(),
			ConvertWithColumn: func(in interface{}, col sql.ColumnType) (interface{}, error) {
				if in == nil {
					return nil, nil
				}
				v := in.(*sql.RawBytes)
				s := string(*v)
				f, err := strconv.ParseFloat(s, 64)
				if err != nil {
					bits := binary.LittleEndian.Uint64(*v)
					f = float64(bits)
				}
				_, scale, _ := col.DecimalSize()
				div := math.Pow(10, float64(scale))
				fv := f / div
				return &fv, nil
			},
		},
	}
}

var stringMatch, _ = regexp.Compile(`Nullable\(String`)

func NullableString() sqlutil.Converter {
	kind := "Nullable(String)"
	return sqlutil.Converter{
		Name:           kind,
		InputScanType:  reflect.TypeOf(sql.NullString{}),
		InputTypeRegex: stringMatch,
		InputTypeName:  kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeNullableString,
			ConverterFunc: func(in interface{}) (interface{}, error) {
				if in == nil {
					return nil, nil
				}
				v := in.(*sql.NullString)
				if !v.Valid {
					return (*string)(nil), nil
				}
				return &v.String, nil
			},
		},
	}
}

// Array converters

func ArrayConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, c := range arrayTypes {
		list = append(list, ArrayToCommaDelimitedString(c.name, c.kind))
	}
	return list
}

func ArrayToCommaDelimitedString(kind string, i interface{}) sqlutil.Converter {
	kind = fmt.Sprintf("Array(%s)", kind)
	return sqlutil.Converter{
		Name:          kind,
		InputScanType: reflect.TypeOf(i),
		InputTypeName: kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeNullableString,
			ConverterFunc: func(in interface{}) (interface{}, error) {
				if in == nil {
					return (*string)(nil), nil
				}
				val := strings.Replace(fmt.Sprint(in), "&", "", 1)
				val = strings.Trim(strings.Join(strings.Fields(val), ","), "[]")
				return &val, nil
			},
		},
	}
}

type ArrayType struct {
	name string
	kind interface{}
}

var arrayTypes = []ArrayType{
	{"String", []string{}},
	{"Int8", []int8{}},
	{"Int16", []int16{}},
	{"Int32", []int32{}},
	{"Int64", []int64{}},
	{"UInt8", []uint8{}},
	{"UInt16", []uint16{}},
	{"UInt32", []uint32{}},
	{"UInt64", []uint64{}},
	{"Float32", []float32{}},
	{"Float64", []float64{}},
}
