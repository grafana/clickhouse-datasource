package converters

import (
	"encoding/json"
	"fmt"
	"math/big"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/shopspring/decimal"
)

type Converter struct {
	scanType   reflect.Type
	fieldType  data.FieldType
	matchRegex *regexp.Regexp
	convert    func(in interface{}) (interface{}, error)
}

var dateTimeMatch, _ = regexp.Compile(`^Date\(?`)
var dateNullableTimeMatch, _ = regexp.Compile(`^Nullable\(Date\(?`)

var stringNullableMatch, _ = regexp.Compile(`Nullable\(String`)

var decimalMatch, _ = regexp.Compile(`^Decimal`)
var decimalNullableMatch, _ = regexp.Compile(`^Nullable\(Decimal`)

var tupleMatch, _ = regexp.Compile(`^Tuple\(.*\)`)
var nestedMatch, _ = regexp.Compile(`^Nested\(.*\)`)

// for complex Arrays e.g. Array(Tuple)
var complexArrayMatch, _ = regexp.Compile(`^Array\(.*\)`)

var mapMatch, _ = regexp.Compile(`^Map\(.*\)`)

var Types = map[string]Converter{
	"Bool": {
		scanType:  reflect.PtrTo(reflect.TypeOf(true)),
		fieldType: data.FieldTypeBool,
	},
	"Nullable(Bool)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(true))),
		fieldType: data.FieldTypeNullableBool,
	},
	"Float64": {
		scanType:  reflect.PtrTo(reflect.TypeOf(float64(0))),
		fieldType: data.FieldTypeFloat64,
	},
	"Float32": {
		scanType:  reflect.PtrTo(reflect.TypeOf(float32(0))),
		fieldType: data.FieldTypeFloat32,
	},
	"Nullable(Float32)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(float32(0)))),
		fieldType: data.FieldTypeNullableFloat32,
	},
	"Nullable(Float64)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(float64(0)))),
		fieldType: data.FieldTypeNullableFloat64,
	},
	"Int64": {
		scanType:  reflect.PtrTo(reflect.TypeOf(int64(0))),
		fieldType: data.FieldTypeInt64,
	},
	"Int32": {
		scanType:  reflect.PtrTo(reflect.TypeOf(int32(0))),
		fieldType: data.FieldTypeInt32,
	},
	"Int16": {
		scanType:  reflect.PtrTo(reflect.TypeOf(int16(0))),
		fieldType: data.FieldTypeInt16,
	},
	"Int8": {
		scanType:  reflect.PtrTo(reflect.TypeOf(int8(0))),
		fieldType: data.FieldTypeInt8,
	},
	"UInt64": {
		scanType:  reflect.PtrTo(reflect.TypeOf(uint64(0))),
		fieldType: data.FieldTypeUint64,
	},
	"UInt32": {
		scanType:  reflect.PtrTo(reflect.TypeOf(uint32(0))),
		fieldType: data.FieldTypeUint32,
	},
	"UInt16": {
		scanType:  reflect.PtrTo(reflect.TypeOf(uint16(0))),
		fieldType: data.FieldTypeUint16,
	},
	"UInt8": {
		scanType:  reflect.PtrTo(reflect.TypeOf(uint8(0))),
		fieldType: data.FieldTypeUint8,
	},
	"Nullable(UInt64)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint64(0)))),
		fieldType: data.FieldTypeNullableUint64,
	},
	"Nullable(UInt32)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint32(0)))),
		fieldType: data.FieldTypeNullableUint32,
	},
	"Nullable(UInt16)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint16(0)))),
		fieldType: data.FieldTypeNullableUint16,
	},
	"Nullable(UInt8)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(uint8(0)))),
		fieldType: data.FieldTypeNullableUint8,
	},
	"Nullable(Int64)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int64(0)))),
		fieldType: data.FieldTypeNullableInt64,
	},
	"Nullable(Int32)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int32(0)))),
		fieldType: data.FieldTypeNullableInt32,
	},
	"Nullable(Int16)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int16(0)))),
		fieldType: data.FieldTypeNullableInt16,
	},
	"Nullable(Int8)": {
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(int8(0)))),
		fieldType: data.FieldTypeNullableInt8,
	},
	// this is in precise and in appropriate for any math, but everything goes to floats in JS anyway
	"Int128": {
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PtrTo(reflect.TypeOf(big.NewInt(0))),
		convert:   bigIntConvert,
	},
	"Nullable(Int128)": {
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(big.NewInt(0)))),
		convert:   bigIntNullableConvert,
	},
	"Int256": {
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PtrTo(reflect.TypeOf(big.NewInt(0))),
		convert:   bigIntConvert,
	},
	"Nullable(Int256)": {
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(big.NewInt(0)))),
		convert:   bigIntNullableConvert,
	},
	"UInt128": {
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PtrTo(reflect.TypeOf(big.NewInt(0))),
		convert:   bigIntConvert,
	},
	"Nullable(UInt128)": {
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(big.NewInt(0)))),
		convert:   bigIntNullableConvert,
	},
	"UInt256": {
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PtrTo(reflect.TypeOf(big.NewInt(0))),
		convert:   bigIntConvert,
	},
	"Nullable(UInt256)": {
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(big.NewInt(0)))),
		convert:   bigIntNullableConvert,
	},
	// covers DateTime with tz, DateTime64 - see regexes
	"Date": {
		fieldType:  data.FieldTypeTime,
		scanType:   reflect.PtrTo(reflect.TypeOf(time.Time{})),
		matchRegex: dateTimeMatch,
	},
	"Nullable(Date)": {
		fieldType:  data.FieldTypeNullableTime,
		scanType:   reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(time.Time{}))),
		matchRegex: dateNullableTimeMatch,
	},
	"Nullable(String)": {
		fieldType:  data.FieldTypeNullableString,
		scanType:   reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(""))),
		matchRegex: stringNullableMatch,
	},
	"Decimal": {
		fieldType:  data.FieldTypeFloat64,
		scanType:   reflect.PtrTo(reflect.TypeOf(decimal.Decimal{})),
		matchRegex: decimalMatch,
		convert:    decimalConvert,
	},
	"Nullable(Decimal)": {
		fieldType:  data.FieldTypeNullableFloat64,
		scanType:   reflect.PtrTo(reflect.PtrTo(reflect.TypeOf(decimal.Decimal{}))),
		matchRegex: decimalNullableMatch,
		convert:    decimalNullConvert,
	},
	"Tuple()": {
		fieldType:  data.FieldTypeNullableString,
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
		matchRegex: tupleMatch,
		convert:    jsonConverter,
	},
	// NestedConverter currently only supports flatten_nested=0 only which can be marshalled into []map[string]interface{}
	"Nested()": {
		fieldType:  data.FieldTypeNullableString,
		scanType:   reflect.TypeOf([]map[string]interface{}{}),
		matchRegex: nestedMatch,
		convert:    jsonConverter,
	},
	//complex arrays - simple arrays are added first and matched first
	"Array()": {
		fieldType:  data.FieldTypeNullableString,
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
		matchRegex: complexArrayMatch,
		convert:    jsonConverter,
	},
	"Map()": {
		fieldType:  data.FieldTypeNullableString,
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
		matchRegex: mapMatch,
		convert:    jsonConverter,
	},
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

// test unnamed tuples, lists of nullable e.g. Array(Nullable(Int64))

var ComplexTypes = []string{"Map"}
var ClickhouseConverters = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, array := range arrayTypes {
		list = append(list, CreateConverter(fmt.Sprintf("Array(%s)", array.name), Converter{
			scanType:  reflect.TypeOf(array.kind),
			fieldType: data.FieldTypeNullableString,
			convert:   arrayConverter,
		}))
	}

	for name, converter := range Types {
		list = append(list, CreateConverter(name, converter))
	}
	return list
}

func CreateConverter(name string, converter Converter) sqlutil.Converter {
	convert := defaultConvert
	if converter.convert != nil {
		convert = converter.convert
	}
	return sqlutil.Converter{
		Name:           name,
		InputScanType:  converter.scanType,
		InputTypeRegex: converter.matchRegex,
		InputTypeName:  name,
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     converter.fieldType,
			ConverterFunc: convert,
		},
	}
}

// MarshalJSON marshals the enum as a quoted json string
func marshalJSON(in interface{}) (string, error) {
	jBytes, err := json.Marshal(in)
	if err != nil {
		return "", err
	}
	return string(jBytes), nil
}

func arrayConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return (*string)(nil), nil
	}
	val := strings.Replace(fmt.Sprint(in), "&", "", 1)
	val = strings.Trim(strings.Join(strings.Fields(val), ","), "[]")
	return &val, nil
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

func defaultConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return reflect.Zero(reflect.TypeOf(in)).Interface(), nil
	}
	return reflect.ValueOf(in).Elem().Interface(), nil
}

func decimalConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return float64(0), nil
	}
	v, ok := in.(*decimal.Decimal)
	if !ok {
		return nil, fmt.Errorf("invalid decimal - %v", in)
	}
	f, _ := (*v).Float64()
	return f, nil
}

func decimalNullConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return float64(0), nil
	}
	v, ok := in.(**decimal.Decimal)
	if !ok {
		return nil, fmt.Errorf("invalid decimal - %v", in)
	}
	if *v == nil {
		return (*float64)(nil), nil
	}
	f, _ := (*v).Float64()
	return &f, nil
}

func bigIntConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return float64(0), nil
	}
	v, ok := in.(**big.Int)
	if !ok {
		return nil, fmt.Errorf("invalid int256 - %v", in)
	}
	f, _ := new(big.Float).SetInt(*v).Float64()
	return f, nil
}

func bigIntNullableConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return (*float64)(nil), nil
	}
	v, ok := in.(***big.Int)
	if !ok {
		return nil, fmt.Errorf("invalid int128 - %v", in)
	}
	if *v == nil {
		return (*float64)(nil), nil
	}
	f, _ := new(big.Float).SetInt(**v).Float64()
	return &f, nil
}
