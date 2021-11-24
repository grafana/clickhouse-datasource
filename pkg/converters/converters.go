package converters

import (
	"database/sql"
	"fmt"
	"reflect"
	"regexp"
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
var CLICKHOUSE_CONVERTERS = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list = NullableNumeric()
	list = append(list, NullableDate())
	list = append(list, NullableDecimal())
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

var decimalMatch, _ = regexp.Compile(`^Nullable\(Decimal`)

func NullableDecimal() sqlutil.Converter {
	kind := "Nullable(Decimal)"
	return sqlutil.Converter{
		Name:           kind,
		InputScanType:  reflect.TypeOf(sql.NullFloat64{}),
		InputTypeRegex: decimalMatch,
		InputTypeName:  kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType: data.FieldTypeFloat64.NullableType(),
			ConverterFunc: func(in interface{}) (interface{}, error) {
				return sqlFloat64ToFloat64(in)
			},
		},
	}
}
