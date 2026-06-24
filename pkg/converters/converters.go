package converters

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
)

type Converter struct {
	name       string
	convert    func(in interface{}) (interface{}, error)
	fieldType  data.FieldType
	matchRegex *regexp.Regexp
	scanType   reflect.Type
}

// matchRegexes is a mapping of regular expressions.
// When adding entries, try to prevent overlap in regular expressions.
// For example `^Date` and `^DateTime` could conflict when matching `DateTime64`
var matchRegexes = map[string]*regexp.Regexp{
	// for complex Arrays e.g. Array(Tuple)
	"Array()":                         regexp.MustCompile(`^Array\(.*\)`),
	"Date":                            regexp.MustCompile(`^Date\(?`),
	"Decimal":                         regexp.MustCompile(`^Decimal`),
	"FixedString()":                   regexp.MustCompile(`^Nullable\(FixedString\(.*\)\)`),
	"IP":                              regexp.MustCompile(`^IPv[4,6]`),
	"LowCardinality()":                regexp.MustCompile(`^LowCardinality\(([^)]*)\)`),
	"LowCardinality(Nullable)":        regexp.MustCompile(`^LowCardinality\(Nullable([^)]*)\)`),
	"Map()":                           regexp.MustCompile(`^Map\(.*\)`),
	"Nested()":                        regexp.MustCompile(`^Nested\(.*\)`),
	"Nullable(Date)":                  regexp.MustCompile(`^Nullable\(Date\(?`),
	"Nullable(Decimal)":               regexp.MustCompile(`^Nullable\(Decimal`),
	"Nullable(IP)":                    regexp.MustCompile(`^Nullable\(IP`),
	"Nullable(String)":                regexp.MustCompile(`^Nullable\(String`),
	"Point":                           regexp.MustCompile(`^Point`),
	"SimpleAggregateFunction(String)": regexp.MustCompile(`^SimpleAggregateFunction\([^,]+,\s*String\)$`),
	"SimpleAggregateFunction(Nullable(String))": regexp.MustCompile(`^SimpleAggregateFunction\([^,]+,\s*Nullable\(String\)\)$`),
	"SimpleAggregateFunction()":                 regexp.MustCompile(`^SimpleAggregateFunction\(.*\)`),
	"Tuple()":                                   regexp.MustCompile(`^Tuple\(.*\)`),
	"Variant":                                   regexp.MustCompile(`^Variant`),
	"Dynamic":                                   regexp.MustCompile(`^Dynamic`),
	"JSON":                                      regexp.MustCompile(`^JSON`),
	"Nullable(JSON)":                            regexp.MustCompile(`^Nullable\(JSON`),
	"Enum":                                      regexp.MustCompile(`^Enum(8|16)\(.*\)`),
	"Nullable(Enum)":                            regexp.MustCompile(`^Nullable\(Enum(8|16)\(.*\)\)`),
}

// Converters defines a list of type converters.
// When a converter is looked up by name or regex, it will be in the order they are defined below.
// This is important for regular expressions that may overlap or conflict.
var Converters = []Converter{
	{
		name:      "String",
		fieldType: data.FieldTypeString,
		scanType:  reflect.PointerTo(reflect.TypeOf("")),
	},
	{
		name:       "Enum",
		fieldType:  data.FieldTypeString,
		matchRegex: matchRegexes["Enum"],
		scanType:   reflect.PointerTo(reflect.TypeOf("")),
	},
	{
		name:       "Nullable(Enum)",
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["Nullable(Enum)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	{
		name:      "Bool",
		fieldType: data.FieldTypeBool,
		scanType:  reflect.PointerTo(reflect.TypeOf(true)),
	},
	{
		name:      "Nullable(Bool)",
		fieldType: data.FieldTypeNullableBool,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(true))),
	},
	{
		name:      "Float64",
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(float64(0))),
	},
	{
		name:      "Float32",
		fieldType: data.FieldTypeFloat32,
		scanType:  reflect.PointerTo(reflect.TypeOf(float32(0))),
	},
	{
		name:      "Nullable(Float32)",
		fieldType: data.FieldTypeNullableFloat32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(float32(0)))),
	},
	{
		name:      "Nullable(Float64)",
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(float64(0)))),
	},
	{
		name:      "Int64",
		fieldType: data.FieldTypeInt64,
		scanType:  reflect.PointerTo(reflect.TypeOf(int64(0))),
	},
	{
		name:      "Int32",
		fieldType: data.FieldTypeInt32,
		scanType:  reflect.PointerTo(reflect.TypeOf(int32(0))),
	},
	{
		name:      "Int16",
		fieldType: data.FieldTypeInt16,
		scanType:  reflect.PointerTo(reflect.TypeOf(int16(0))),
	},
	{
		name:      "Int8",
		fieldType: data.FieldTypeInt8,
		scanType:  reflect.PointerTo(reflect.TypeOf(int8(0))),
	},
	{
		name:      "UInt64",
		fieldType: data.FieldTypeUint64,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint64(0))),
	},
	{
		name:      "UInt32",
		fieldType: data.FieldTypeUint32,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint32(0))),
	},
	{
		name:      "UInt16",
		fieldType: data.FieldTypeUint16,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint16(0))),
	},
	{
		name:      "UInt8",
		fieldType: data.FieldTypeUint8,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint8(0))),
	},
	{
		name:      "Nullable(UInt64)",
		fieldType: data.FieldTypeNullableUint64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint64(0)))),
	},
	{
		name:      "Nullable(UInt32)",
		fieldType: data.FieldTypeNullableUint32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint32(0)))),
	},
	{
		name:      "Nullable(UInt16)",
		fieldType: data.FieldTypeNullableUint16,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint16(0)))),
	},
	{
		name:      "Nullable(UInt8)",
		fieldType: data.FieldTypeNullableUint8,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint8(0)))),
	},
	{
		name:      "Nullable(Int64)",
		fieldType: data.FieldTypeNullableInt64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int64(0)))),
	},
	{
		name:      "Nullable(Int32)",
		fieldType: data.FieldTypeNullableInt32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int32(0)))),
	},
	{
		name:      "Nullable(Int16)",
		fieldType: data.FieldTypeNullableInt16,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int16(0)))),
	},
	{
		name:      "Nullable(Int8)",
		fieldType: data.FieldTypeNullableInt8,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int8(0)))),
	},
	{
		name:      "Int128",
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	{
		name:      "Nullable(Int128)",
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	{
		name:      "Int256",
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	{
		name:      "Nullable(Int256)",
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	{
		name:      "UInt128",
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	{
		name:      "Nullable(UInt128)",
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	{
		name:      "UInt256",
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	{
		name:      "Nullable(UInt256)",
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	{
		name:       "Date",
		fieldType:  data.FieldTypeTime,
		matchRegex: matchRegexes["Date"],
		scanType:   reflect.PointerTo(reflect.TypeOf(time.Time{})),
	},
	{
		name:       "Nullable(Date)",
		fieldType:  data.FieldTypeNullableTime,
		matchRegex: matchRegexes["Nullable(Date)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(time.Time{}))),
	},
	{
		name:       "Nullable(String)",
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["Nullable(String)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	{
		name:       "Decimal",
		convert:    decimalConvert,
		fieldType:  data.FieldTypeFloat64,
		matchRegex: matchRegexes["Decimal"],
		scanType:   reflect.PointerTo(reflect.TypeOf(decimal.Decimal{})),
	},
	{
		name:       "Nullable(Decimal)",
		convert:    decimalNullConvert,
		fieldType:  data.FieldTypeNullableFloat64,
		matchRegex: matchRegexes["Nullable(Decimal)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(decimal.Decimal{}))),
	},
	{
		name:       "Tuple()",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Tuple()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "Variant",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Variant"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "Dynamic",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Dynamic"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "JSON",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["JSON"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "Nullable(JSON)",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Nullable(JSON)"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "Nested()",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Nested()"],
		scanType:   reflect.TypeOf([]map[string]interface{}{}),
	},
	{
		name:       "Array()",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Array()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "Map()",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Map()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:       "FixedString()",
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["FixedString()"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	{
		name:       "IP",
		convert:    ipConverter,
		fieldType:  data.FieldTypeString,
		matchRegex: matchRegexes["IP"],
		scanType:   reflect.PointerTo(reflect.TypeOf(net.IP{})),
	},
	{
		name:       "Nullable(IP)",
		convert:    ipNullConverter,
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["Nullable(IP)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(net.IP{}))),
	},
	{
		name:       "SimpleAggregateFunction(String)",
		fieldType:  data.FieldTypeString,
		matchRegex: matchRegexes["SimpleAggregateFunction(String)"],
		scanType:   reflect.PointerTo(reflect.TypeOf("")),
	},
	{
		name:       "SimpleAggregateFunction(Nullable(String))",
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["SimpleAggregateFunction(Nullable(String))"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	{
		name:       "Point",
		convert:    pointConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["Point"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	{
		name:      "LowCardinality(String)",
		fieldType: data.FieldTypeString,
		scanType:  reflect.PointerTo(reflect.TypeOf("")),
	},
	{
		name:       "LowCardinality(Nullable(String))",
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["LowCardinality(Nullable)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
}

var ClickhouseConverters = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for _, converter := range Converters {
		list = append(list, createConverter(converter))
	}
	list = append(list, generateSAFConverters()...)
	// SAF catch-all for any remaining unrecognized inner types (e.g. custom types)
	list = append(list, sqlutil.Converter{
		Name:           "SimpleAggregateFunction()",
		InputScanType:  reflect.TypeOf((*interface{})(nil)).Elem(),
		InputTypeRegex: matchRegexes["SimpleAggregateFunction()"],
		InputTypeName:  "SimpleAggregateFunction()",
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     data.FieldTypeJSON,
			ConverterFunc: jsonConverter,
		},
	})
	return list
}

// safTypeMapping defines inner types for which we generate native SAF converters.
// Each entry maps a regex pattern for the inner type to the Grafana field type and
// a converter function that extracts the native value from interface{}.
type safTypeEntry struct {
	innerPattern string         // regex for the inner type (after the function name)
	fieldType    data.FieldType // Grafana field type to report
	convert      func(in interface{}) (interface{}, error)
}

var safTypeMappings = []safTypeEntry{
	// Non-nullable numeric types
	{"UInt8", data.FieldTypeUint8, safConvertUint8},
	{"UInt16", data.FieldTypeUint16, safConvertUint16},
	{"UInt32", data.FieldTypeUint32, safConvertUint32},
	{"UInt64", data.FieldTypeUint64, safConvertUint64},
	{"Int8", data.FieldTypeInt8, safConvertInt8},
	{"Int16", data.FieldTypeInt16, safConvertInt16},
	{"Int32", data.FieldTypeInt32, safConvertInt32},
	{"Int64", data.FieldTypeInt64, safConvertInt64},
	{"Float32", data.FieldTypeFloat32, safConvertFloat32},
	{"Float64", data.FieldTypeFloat64, safConvertFloat64},
	{"Bool", data.FieldTypeBool, safConvertBool},
	// Nullable numeric types
	{"Nullable\\(UInt8\\)", data.FieldTypeNullableUint8, safConvertNullableUint8},
	{"Nullable\\(UInt16\\)", data.FieldTypeNullableUint16, safConvertNullableUint16},
	{"Nullable\\(UInt32\\)", data.FieldTypeNullableUint32, safConvertNullableUint32},
	{"Nullable\\(UInt64\\)", data.FieldTypeNullableUint64, safConvertNullableUint64},
	{"Nullable\\(Int8\\)", data.FieldTypeNullableInt8, safConvertNullableInt8},
	{"Nullable\\(Int16\\)", data.FieldTypeNullableInt16, safConvertNullableInt16},
	{"Nullable\\(Int32\\)", data.FieldTypeNullableInt32, safConvertNullableInt32},
	{"Nullable\\(Int64\\)", data.FieldTypeNullableInt64, safConvertNullableInt64},
	{"Nullable\\(Float32\\)", data.FieldTypeNullableFloat32, safConvertNullableFloat32},
	{"Nullable\\(Float64\\)", data.FieldTypeNullableFloat64, safConvertNullableFloat64},
	{"Nullable\\(Bool\\)", data.FieldTypeNullableBool, safConvertNullableBool},
	// DateTime types (patterns account for optional timezone parameter)
	{"DateTime64\\(\\d+(,\\s*'[^']*')?\\)", data.FieldTypeTime, safConvertTime},
	{"DateTime(\\('[^']*'\\))?", data.FieldTypeTime, safConvertTime},
	{"Date32", data.FieldTypeTime, safConvertTime},
	{"Date", data.FieldTypeTime, safConvertTime},
	{"Nullable\\(DateTime64\\(\\d+(,\\s*'[^']*')?\\)\\)", data.FieldTypeNullableTime, safConvertNullableTime},
	{"Nullable\\(DateTime(\\('[^']*'\\))?\\)", data.FieldTypeNullableTime, safConvertNullableTime},
	{"Nullable\\(Date32\\)", data.FieldTypeNullableTime, safConvertNullableTime},
	{"Nullable\\(Date\\)", data.FieldTypeNullableTime, safConvertNullableTime},
}

func generateSAFConverters() []sqlutil.Converter {
	var converters []sqlutil.Converter
	for _, entry := range safTypeMappings {
		pattern := `^SimpleAggregateFunction\([^,]+,\s*` + entry.innerPattern + `\)$`
		converters = append(converters, sqlutil.Converter{
			Name:           "SimpleAggregateFunction(" + entry.innerPattern + ")",
			InputScanType:  reflect.TypeOf((*interface{})(nil)).Elem(),
			InputTypeRegex: regexp.MustCompile(pattern),
			InputTypeName:  "SimpleAggregateFunction(" + entry.innerPattern + ")",
			FrameConverter: sqlutil.FrameConverter{
				FieldType:     entry.fieldType,
				ConverterFunc: entry.convert,
			},
		})
	}
	return converters
}

// SAF converter functions. The ClickHouse driver scans SAF values into interface{},
// and the underlying value is the native Go type matching the inner column type.

func safConvertUint8(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(uint8); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF uint8", *(in.(*interface{})))
}

func safConvertUint16(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(uint16); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF uint16", *(in.(*interface{})))
}

func safConvertUint32(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(uint32); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF uint32", *(in.(*interface{})))
}

func safConvertUint64(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(uint64); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF uint64", *(in.(*interface{})))
}

func safConvertInt8(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(int8); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF int8", *(in.(*interface{})))
}

func safConvertInt16(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(int16); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF int16", *(in.(*interface{})))
}

func safConvertInt32(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(int32); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF int32", *(in.(*interface{})))
}

func safConvertInt64(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(int64); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF int64", *(in.(*interface{})))
}

func safConvertFloat32(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(float32); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF float32", *(in.(*interface{})))
}

func safConvertFloat64(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(float64); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF float64", *(in.(*interface{})))
}

func safConvertBool(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(bool); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF bool", *(in.(*interface{})))
}

func safConvertNullableUint8(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*uint8)(nil), nil
	}
	if val, ok := v.(*uint8); ok {
		return val, nil
	}
	if val, ok := v.(uint8); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(uint8)", v)
}

func safConvertNullableUint16(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*uint16)(nil), nil
	}
	if val, ok := v.(*uint16); ok {
		return val, nil
	}
	if val, ok := v.(uint16); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(uint16)", v)
}

func safConvertNullableUint32(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*uint32)(nil), nil
	}
	if val, ok := v.(*uint32); ok {
		return val, nil
	}
	if val, ok := v.(uint32); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(uint32)", v)
}

func safConvertNullableUint64(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*uint64)(nil), nil
	}
	if val, ok := v.(*uint64); ok {
		return val, nil
	}
	if val, ok := v.(uint64); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(uint64)", v)
}

func safConvertNullableInt8(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*int8)(nil), nil
	}
	if val, ok := v.(*int8); ok {
		return val, nil
	}
	if val, ok := v.(int8); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(int8)", v)
}

func safConvertNullableInt16(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*int16)(nil), nil
	}
	if val, ok := v.(*int16); ok {
		return val, nil
	}
	if val, ok := v.(int16); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(int16)", v)
}

func safConvertNullableInt32(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*int32)(nil), nil
	}
	if val, ok := v.(*int32); ok {
		return val, nil
	}
	if val, ok := v.(int32); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(int32)", v)
}

func safConvertNullableInt64(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*int64)(nil), nil
	}
	if val, ok := v.(*int64); ok {
		return val, nil
	}
	if val, ok := v.(int64); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(int64)", v)
}

func safConvertNullableFloat32(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*float32)(nil), nil
	}
	if val, ok := v.(*float32); ok {
		return val, nil
	}
	if val, ok := v.(float32); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(float32)", v)
}

func safConvertNullableFloat64(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*float64)(nil), nil
	}
	if val, ok := v.(*float64); ok {
		return val, nil
	}
	if val, ok := v.(float64); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(float64)", v)
}

func safConvertNullableBool(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*bool)(nil), nil
	}
	if val, ok := v.(*bool); ok {
		return val, nil
	}
	if val, ok := v.(bool); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(bool)", v)
}

func safConvertTime(in interface{}) (interface{}, error) {
	if v, ok := (*(in.(*interface{}))).(time.Time); ok {
		return v, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF time", *(in.(*interface{})))
}

func safConvertNullableTime(in interface{}) (interface{}, error) {
	v := (*(in.(*interface{})))
	if v == nil {
		return (*time.Time)(nil), nil
	}
	if val, ok := v.(*time.Time); ok {
		return val, nil
	}
	if val, ok := v.(time.Time); ok {
		return &val, nil
	}
	return nil, fmt.Errorf("unexpected type %T for SAF Nullable(time)", v)
}

// GetConverter returns a sqlutil.Converter for the given column type.
func GetConverter(columnType string) sqlutil.Converter {
	// check for 'LowCardinality()' type first and get the converter for the inner type
	if innerType, ok := extractLowCardinalityType(columnType); ok {
		return GetConverter(innerType)
	}

	// check for 'SimpleAggregateFunction()' type and get the converter for the inner type
	if innerType, ok := extractSimpleAggregateFunctionType(columnType); ok {
		return GetConverter(innerType)
	}

	// direct match by name
	for _, converter := range Converters {
		if converter.name == columnType {
			return createConverter(converter)
		}
	}

	// regex-based search through `Converters` map
	return findConverterWithRegex(columnType)
}

const (
	lowCardinalityPrefix = "LowCardinality("
	lowCardinalitySuffix = ")"
)

// extractLowCardinalityType checks if the column type is a `LowCardinality()` type and returns the inner type.
func extractLowCardinalityType(columnType string) (string, bool) {
	if strings.HasPrefix(columnType, lowCardinalityPrefix) && strings.HasSuffix(columnType, lowCardinalitySuffix) {
		return columnType[len(lowCardinalityPrefix) : len(columnType)-len(lowCardinalitySuffix)], true
	}

	return "", false
}

const (
	simpleAggregateFunctionPrefix = "SimpleAggregateFunction("
	simpleAggregateFunctionSuffix = ")"
)

// extractSimpleAggregateFunctionType checks if the column type is a `SimpleAggregateFunction(func, <type>)` type
// and returns the inner data type (the second argument after the function name).
// For example: SimpleAggregateFunction(any, String) -> String
//
//	SimpleAggregateFunction(any, Nullable(String)) -> Nullable(String)
//	SimpleAggregateFunction(anyLast, Array(String)) -> Array(String)
func extractSimpleAggregateFunctionType(columnType string) (string, bool) {
	if !strings.HasPrefix(columnType, simpleAggregateFunctionPrefix) || !strings.HasSuffix(columnType, simpleAggregateFunctionSuffix) {
		return "", false
	}

	// Extract the content between "SimpleAggregateFunction(" and the final ")"
	inner := columnType[len(simpleAggregateFunctionPrefix) : len(columnType)-len(simpleAggregateFunctionSuffix)]

	// Find the first comma that is not inside nested parentheses.
	// The first argument is the function name (e.g., "any", "anyLast"),
	// and the second argument is the data type.
	depth := 0
	for i, ch := range inner {
		switch ch {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				// Everything after ", " is the inner type
				innerType := strings.TrimSpace(inner[i+1:])
				if innerType == "" {
					return "", false
				}
				return innerType, true
			}
		}
	}

	return "", false
}

// findConverterWithRegex searches through the `Converters` map using regex matching.
func findConverterWithRegex(columnType string) sqlutil.Converter {
	for _, converter := range Converters {
		if converter.matchRegex != nil && converter.matchRegex.MatchString(columnType) {
			return createConverter(converter)
		}
	}

	return sqlutil.Converter{}
}

func createConverter(converter Converter) sqlutil.Converter {
	convert := defaultConvert
	if converter.convert != nil {
		convert = converter.convert
	}
	return sqlutil.Converter{
		Name:           converter.name,
		InputScanType:  converter.scanType,
		InputTypeRegex: converter.matchRegex,
		InputTypeName:  converter.name,
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     converter.fieldType,
			ConverterFunc: convert,
		},
	}
}

func jsonConverter(in any) (any, error) {
	// Unwrap `*any` to be `any`
	if anyPtr, ok := in.(*any); ok {
		in = *anyPtr
	}

	switch v := in.(type) {
	case nil:
		return (json.RawMessage)(nil), nil
	case string:
		return json.RawMessage(v), nil
	case *string:
		return json.RawMessage(*v), nil
	case []byte:
		return json.RawMessage(v), nil
	case *[]byte:
		return json.RawMessage(*v), nil
	default:
	}

	jBytes, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}

	return json.RawMessage(jBytes), nil
}

func defaultConvert(in interface{}) (interface{}, error) {
	if in == nil {
		return reflect.Zero(reflect.TypeOf(in)).Interface(), nil
	}

	// check the type of the input and handle strings separately because they cannot be dereferenced
	val := reflect.ValueOf(in)
	if val.Kind() == reflect.String {
		return in, nil
	}

	// handle pointers and dereference if possible
	if val.Kind() == reflect.Pointer {
		if val.IsNil() {
			return nil, errors.New("nil pointer cannot be dereferenced in defaultConvert")
		}
		return val.Elem().Interface(), nil
	}

	return in, nil
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
		return nil, fmt.Errorf("invalid big int - %v", in)
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
		return nil, fmt.Errorf("invalid big int - %v", in)
	}
	if *v == nil || **v == nil {
		return (*float64)(nil), nil
	}
	f, _ := new(big.Float).SetInt(**v).Float64()
	return &f, nil
}

func ipConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return nil, nil
	}
	v, ok := in.(*net.IP)
	if !ok {
		return nil, fmt.Errorf("invalid ip - %v", in)
	}
	if v == nil {
		return nil, nil
	}
	sIP := v.String()
	return sIP, nil
}

func ipNullConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return nil, nil
	}
	v, ok := in.(**net.IP)
	if !ok {
		return nil, fmt.Errorf("invalid ip - %v", in)
	}
	if *v == nil {
		return nil, nil
	}
	sIP := (*v).String()
	return &sIP, nil
}

func pointConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return nil, nil
	}
	v, ok := (*(in.(*interface{}))).(orb.Point)
	if !ok {
		return nil, fmt.Errorf("invalid point - %v", in)
	}
	return jsonConverter(v)
}
