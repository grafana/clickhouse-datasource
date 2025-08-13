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
	"Array()":                   regexp.MustCompile(`^Array\(.*\)`),
	"Date":                      regexp.MustCompile(`^Date\(?`),
	"Decimal":                   regexp.MustCompile(`^Decimal`),
	"FixedString()":             regexp.MustCompile(`^Nullable\(FixedString\(.*\)\)`),
	"IP":                        regexp.MustCompile(`^IPv[4,6]`),
	"LowCardinality()":          regexp.MustCompile(`^LowCardinality\(([^)]*)\)`),
	"LowCardinality(Nullable)":  regexp.MustCompile(`^LowCardinality\(Nullable([^)]*)\)`),
	"Map()":                     regexp.MustCompile(`^Map\(.*\)`),
	"Nested()":                  regexp.MustCompile(`^Nested\(.*\)`),
	"Nullable(Date)":            regexp.MustCompile(`^Nullable\(Date\(?`),
	"Nullable(Decimal)":         regexp.MustCompile(`^Nullable\(Decimal`),
	"Nullable(IP)":              regexp.MustCompile(`^Nullable\(IP`),
	"Nullable(String)":          regexp.MustCompile(`^Nullable\(String`),
	"Point":                     regexp.MustCompile(`^Point`),
	"SimpleAggregateFunction()": regexp.MustCompile(`^SimpleAggregateFunction\(.*\)`),
	"Tuple()":                   regexp.MustCompile(`^Tuple\(.*\)`),
	"Variant":                   regexp.MustCompile(`^Variant`),
	"Dynamic":                   regexp.MustCompile(`^Dynamic`),
	"JSON":                      regexp.MustCompile(`^JSON`),
	"Nullable(JSON)":            regexp.MustCompile(`^Nullable\(JSON`),
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
		name:       "SimpleAggregateFunction()",
		convert:    jsonConverter,
		fieldType:  data.FieldTypeJSON,
		matchRegex: matchRegexes["SimpleAggregateFunction()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
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
	return list
}

// GetConverter returns a sqlutil.Converter for the given column type.
func GetConverter(columnType string) sqlutil.Converter {
	// check for 'LowCardinality()' type first and get the converter for the inner type
	if innerType, ok := extractLowCardinalityType(columnType); ok {
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
	if val.Kind() == reflect.Ptr {
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
