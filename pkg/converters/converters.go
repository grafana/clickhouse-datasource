package converters

import (
	"database/sql"
	"encoding/binary"
	"encoding/json"
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

var IntTypes = []string{"Int8", "Int16", "Int32", "Int64", "Bool"}
var UintTypes = []string{"UInt8", "UInt16", "UInt32", "UInt64", "UInt128", "UInt256"}
var FloatTypes = []string{"Float32", "Float64"}
var NumericTypes = AllNumericTypes()
var WildcardTypes = []string{"Date", "Decimal"}
var StringTypes = []string{"String"}
var ComplexTypes = []string{"Tuple", "Nested", "Map", "Array"}
var ClickhouseConverters = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list = NumericConverters()
	list = append(list, NullableDateConverter())
	list = append(list, NullableDecimalConverter())
	list = append(list, NullableStringConverter())
	list = append(list, ArrayConverters()...)
	list = append(list, TupleConverter())
	list = append(list, NestedConverter())
	list = append(list, MapConverter())
	return list
}

func AllNumericTypes() []string {
	var types []string
	types = append(types, IntTypes...)
	types = append(types, UintTypes...)
	types = append(types, FloatTypes...)
	return types
}

func NumericConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, kind := range NumericTypes {
		list = append(list, NumericConverter(kind))
		list = append(list, NullableNumericConverter(kind))
	}
	return list
}

type Converter struct {
	scanType    reflect.Type
	convertFunc func(in interface{}) (interface{}, error)
	fieldType   data.FieldType
}

var defaultNumericConverter = Converter{
	scanType: reflect.TypeOf(sql.NullFloat64{}),
	convertFunc: func(in interface{}) (interface{}, error) {
		return sqlFloat64ToFloat64(in)
	},
	fieldType: data.FieldTypeNullableFloat64,
}

func convert(in interface{}) (interface{}, error) {
	if in == nil {
		return reflect.Zero(reflect.TypeOf(in)).Interface(), nil
	}
	return reflect.ValueOf(in).Elem().Interface(), nil
}

var conversions = map[string]Converter{
	"Bool": {
		scanType:    reflect.PtrTo(reflect.TypeOf(true)),
		convertFunc: convert,
		fieldType:   data.FieldTypeBool,
	},
	"Nullable(Bool)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(true))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableBool,
	},
	"Float64": {
		scanType:    reflect.PtrTo(reflect.TypeOf(float64(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeFloat64,
	},
	"Float32": {
		scanType:    reflect.PtrTo(reflect.TypeOf(float32(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeFloat32,
	},
	"Nullable(Float32)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(float32(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableFloat32,
	},
	"Nullable(Float64)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(float64(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableFloat64,
	},
	"Int64": {
		scanType:    reflect.PtrTo(reflect.TypeOf(int64(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeInt64,
	},
	"Int32": {
		scanType:    reflect.PtrTo(reflect.TypeOf(int32(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeInt32,
	},
	"Int16": {
		scanType:    reflect.PtrTo(reflect.TypeOf(int16(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeInt16,
	},
	"Int8": {
		scanType:    reflect.PtrTo(reflect.TypeOf(int8(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeInt8,
	},
	"UInt64": {
		scanType:    reflect.PtrTo(reflect.TypeOf(uint64(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeUint64,
	},
	"UInt32": {
		scanType:    reflect.PtrTo(reflect.TypeOf(uint32(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeUint32,
	},
	"UInt16": {
		scanType:    reflect.PtrTo(reflect.TypeOf(uint16(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeUint16,
	},
	"UInt8": {
		scanType:    reflect.PtrTo(reflect.TypeOf(uint8(0))),
		convertFunc: convert,
		fieldType:   data.FieldTypeUint8,
	},
	"Nullable(UInt64)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint64(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableUint64,
	},
	"Nullable(UInt32)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint32(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableUint32,
	},
	"Nullable(UInt16)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint16(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableUint16,
	},
	"Nullable(UInt8)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint8(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableUint8,
	},
	"Nullable(Int64)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int64(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableInt64,
	},
	"Nullable(Int32)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int32(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableInt32,
	},
	"Nullable(Int16)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int16(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableInt16,
	},
	"Nullable(Int8)": {
		scanType:    reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int8(0)))),
		convertFunc: convert,
		fieldType:   data.FieldTypeNullableInt8,
	},
}

func NumericConverter(kind string) sqlutil.Converter {
	converter, ok := conversions[kind]
	if !ok {
		converter = defaultNumericConverter
	}
	return sqlutil.Converter{
		Name:          kind,
		InputScanType: converter.scanType,
		InputTypeName: kind,
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     converter.fieldType,
			ConverterFunc: converter.convertFunc,
		},
	}

}

func NullableNumericConverter(kind string) sqlutil.Converter {
	return NumericConverter(fmt.Sprintf("Nullable(%s)", kind))
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

func NullableDateConverter() sqlutil.Converter {
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

func NullableDecimalConverter() sqlutil.Converter {
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

func NullableStringConverter() sqlutil.Converter {
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
var nestedArrayMatch, _ = regexp.Compile(`^Array\(.*\)`)

func ArrayConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, c := range arrayTypes {
		list = append(list, ArrayToCommaDelimitedString(c.name, c.kind))
	}
	// complex array converter - e.g. Array(Tuple), Array(Nested), Array(Map) etc.
	var scanType interface{}
	list = append(list, sqlutil.Converter{
		Name:           "Array()",
		InputTypeName:  "Array()",
		InputScanType:  reflect.TypeOf(scanType),
		InputTypeRegex: nestedArrayMatch,
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     data.FieldTypeNullableString,
			ConverterFunc: jsonConverter,
		},
	})
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

//TODO: arrays of any type of numeric
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

// Tuple Converter
var tupleMatch, _ = regexp.Compile(`^Tuple\(.*\)`)

// MarshalJSON marshals the enum as a quoted json string
func marshalJSON(in interface{}) (string, error) {
	jBytes, err := json.Marshal(in)
	if err != nil {
		return "", err
	}
	return string(jBytes), nil
}

func jsonConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return (*string)(nil), nil
	}
	json, err := marshalJSON(in)
	if err != nil {
		return nil, err
	}
	return &json, nil
}

func TupleConverter() sqlutil.Converter {
	kind := "Tuple()"
	return sqlutil.Converter{
		Name:           kind,
		InputTypeName:  kind,
		InputTypeRegex: tupleMatch,
		InputScanType:  reflect.TypeOf((*interface{})(nil)).Elem(),
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     data.FieldTypeNullableString,
			ConverterFunc: jsonConverter,
		},
	}
}

var nestedMatch, _ = regexp.Compile(`^Nested\(.*\)`)

// NestedConverter currently only supports flatten_nested=0 only which can be marshalled into []map[string]interface{}
func NestedConverter() sqlutil.Converter {
	kind := "Nested()"
	return sqlutil.Converter{
		Name:           kind,
		InputTypeName:  kind,
		InputTypeRegex: nestedMatch,
		InputScanType:  reflect.TypeOf([]map[string]interface{}{}),
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     data.FieldTypeNullableString,
			ConverterFunc: jsonConverter,
		},
	}
}

// Map Converter
var mapMatch, _ = regexp.Compile(`^Map\(.*\)`)

func MapConverter() sqlutil.Converter {
	kind := "Map()"
	return sqlutil.Converter{
		Name:           kind,
		InputTypeName:  kind,
		InputTypeRegex: mapMatch,
		InputScanType:  reflect.TypeOf((*interface{})(nil)).Elem(),
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     data.FieldTypeNullableString,
			ConverterFunc: jsonConverter,
		},
	}
}
