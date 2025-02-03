package converters

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/ClickHouse/clickhouse-go/v2"
	"math/big"
	"net"
	"reflect"
	"regexp"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
)

type Converter struct {
	convert    func(in interface{}) (interface{}, error)
	fieldType  data.FieldType
	matchRegex *regexp.Regexp
	scanType   reflect.Type
}

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
	"Variant()":                 regexp.MustCompile(`^Variant\(.*\)`),
	"Dynamic":                   regexp.MustCompile(`^Dynamic`),
	"Dynamic()":                 regexp.MustCompile(`Dynamic\(.*\)`),
	"JSON":                      regexp.MustCompile(`^JSON`),
	"JSON()":                    regexp.MustCompile(`^JSON\(.*\)`),
}

var Converters = map[string]Converter{
	"String": {
		fieldType: data.FieldTypeString,
		scanType:  reflect.PointerTo(reflect.TypeOf("")),
	},
	"Bool": {
		fieldType: data.FieldTypeBool,
		scanType:  reflect.PointerTo(reflect.TypeOf(true)),
	},
	"Nullable(Bool)": {
		fieldType: data.FieldTypeNullableBool,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(true))),
	},
	"Float64": {
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(float64(0))),
	},
	"Float32": {
		fieldType: data.FieldTypeFloat32,
		scanType:  reflect.PointerTo(reflect.TypeOf(float32(0))),
	},
	"Nullable(Float32)": {
		fieldType: data.FieldTypeNullableFloat32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(float32(0)))),
	},
	"Nullable(Float64)": {
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(float64(0)))),
	},
	"Int64": {
		fieldType: data.FieldTypeInt64,
		scanType:  reflect.PointerTo(reflect.TypeOf(int64(0))),
	},
	"Int32": {
		fieldType: data.FieldTypeInt32,
		scanType:  reflect.PointerTo(reflect.TypeOf(int32(0))),
	},
	"Int16": {
		fieldType: data.FieldTypeInt16,
		scanType:  reflect.PointerTo(reflect.TypeOf(int16(0))),
	},
	"Int8": {
		fieldType: data.FieldTypeInt8,
		scanType:  reflect.PointerTo(reflect.TypeOf(int8(0))),
	},
	"UInt64": {
		fieldType: data.FieldTypeUint64,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint64(0))),
	},
	"UInt32": {
		fieldType: data.FieldTypeUint32,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint32(0))),
	},
	"UInt16": {
		fieldType: data.FieldTypeUint16,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint16(0))),
	},
	"UInt8": {
		fieldType: data.FieldTypeUint8,
		scanType:  reflect.PointerTo(reflect.TypeOf(uint8(0))),
	},
	"Nullable(UInt64)": {
		fieldType: data.FieldTypeNullableUint64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint64(0)))),
	},
	"Nullable(UInt32)": {
		fieldType: data.FieldTypeNullableUint32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint32(0)))),
	},
	"Nullable(UInt16)": {
		fieldType: data.FieldTypeNullableUint16,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint16(0)))),
	},
	"Nullable(UInt8)": {
		fieldType: data.FieldTypeNullableUint8,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(uint8(0)))),
	},
	"Nullable(Int64)": {
		fieldType: data.FieldTypeNullableInt64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int64(0)))),
	},
	"Nullable(Int32)": {
		fieldType: data.FieldTypeNullableInt32,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int32(0)))),
	},
	"Nullable(Int16)": {
		fieldType: data.FieldTypeNullableInt16,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int16(0)))),
	},
	"Nullable(Int8)": {
		fieldType: data.FieldTypeNullableInt8,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(int8(0)))),
	},
	// this is in precise and in appropriate for any math, but everything goes to floats in JS anyway
	"Int128": {
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	"Nullable(Int128)": {
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	"Int256": {
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	"Nullable(Int256)": {
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	"UInt128": {
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	"Nullable(UInt128)": {
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	"UInt256": {
		convert:   bigIntConvert,
		fieldType: data.FieldTypeFloat64,
		scanType:  reflect.PointerTo(reflect.TypeOf(big.NewInt(0))),
	},
	"Nullable(UInt256)": {
		convert:   bigIntNullableConvert,
		fieldType: data.FieldTypeNullableFloat64,
		scanType:  reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(big.NewInt(0)))),
	},
	// covers DateTime with tz, DateTime64 - see regexes, Date32
	"Date": {
		fieldType:  data.FieldTypeTime,
		matchRegex: matchRegexes["Date"],
		scanType:   reflect.PointerTo(reflect.TypeOf(time.Time{})),
	},
	"Nullable(Date)": {
		fieldType:  data.FieldTypeNullableTime,
		matchRegex: matchRegexes["Nullable(Date)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(time.Time{}))),
	},
	"Nullable(String)": {
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["Nullable(String)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	"Decimal": {
		convert:    decimalConvert,
		fieldType:  data.FieldTypeFloat64,
		matchRegex: matchRegexes["Decimal"],
		scanType:   reflect.PointerTo(reflect.TypeOf(decimal.Decimal{})),
	},
	"Nullable(Decimal)": {
		convert:    decimalNullConvert,
		fieldType:  data.FieldTypeNullableFloat64,
		matchRegex: matchRegexes["Nullable(Decimal)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(decimal.Decimal{}))),
	},
	"Tuple()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Tuple()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"Variant()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Variant()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"Dynamic": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Dynamic"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"Dynamic()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Dynamic()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"JSON": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["JSON"],
		scanType:   reflect.TypeOf((*clickhouse.JSON)(nil)).Elem(),
	},
	"JSON()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["JSON()"],
		scanType:   reflect.TypeOf((*clickhouse.JSON)(nil)).Elem(),
	},
	// NestedConverter currently only supports flatten_nested=0 only which can be marshalled into []map[string]interface{}
	"Nested()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Nested()"],
		scanType:   reflect.TypeOf([]map[string]interface{}{}),
	},
	"Array()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Array()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"Map()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Map()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"FixedString()": {
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["FixedString()"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
	"IP": {
		convert:    ipConverter,
		fieldType:  data.FieldTypeString,
		matchRegex: matchRegexes["IP"],
		scanType:   reflect.PointerTo(reflect.TypeOf(net.IP{})),
	},
	"Nullable(IP)": {
		convert:    ipNullConverter,
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["Nullable(IP)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(net.IP{}))),
	},
	"SimpleAggregateFunction()": {
		convert:    jsonConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["SimpleAggregateFunction()"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	"Point": {
		convert:    pointConverter,
		fieldType:  data.FieldTypeNullableJSON,
		matchRegex: matchRegexes["Point"],
		scanType:   reflect.TypeOf((*interface{})(nil)).Elem(),
	},
	// // This is a temporary solution to handle LowCardinality types.
	// // We'll need to add support for LowCardinality types to `sqlutil` package.
	"LowCardinality(String)": {
		fieldType: data.FieldTypeString,
		scanType:  reflect.PointerTo(reflect.TypeOf("")),
	},
	"LowCardinality(Nullable(String))": {
		fieldType:  data.FieldTypeNullableString,
		matchRegex: matchRegexes["LowCardinality(Nullable)"],
		scanType:   reflect.PointerTo(reflect.PointerTo(reflect.TypeOf(""))),
	},
}

var ClickhouseConverters = ClickHouseConverters()

func ClickHouseConverters() []sqlutil.Converter {
	var list []sqlutil.Converter
	for name, converter := range Converters {
		list = append(list, createConverter(name, converter))
	}
	return list
}

// GetConverter returns a sqlutil.Converter for the given column type.
func GetConverter(columnType string) sqlutil.Converter {
	// check for 'LowCardinality()' type first and get the converter for the inner type
	if ok, innerType := extractLowCardinalityType(columnType); ok {
		return GetConverter(innerType)
	}

	// direct match or regex-based match in `Converters` map
	if converter, ok := Converters[columnType]; ok {
		return createConverter(columnType, converter)
	}

	// regex-based search through `Converters` map
	return findConverterWithRegex(columnType)
}

// extractLowCardinalityType checks if the column type is a `LowCardinality()` type and returns the inner type.
func extractLowCardinalityType(columnType string) (bool, string) {
	if matches := matchRegexes["LowCardinality()"].FindStringSubmatch(columnType); len(matches) > 1 {
		return true, matches[1]
	}

	return false, ""
}

// findConverterWithRegex searches through the `Converters` map using regex matching.
func findConverterWithRegex(columnType string) sqlutil.Converter {
	for name, converter := range Converters {
		if converter.matchRegex != nil && converter.matchRegex.MatchString(columnType) {
			return createConverter(name, converter)
		}
	}

	return sqlutil.Converter{}
}

func createConverter(name string, converter Converter) sqlutil.Converter {
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

func jsonConverter(in interface{}) (interface{}, error) {
	if in == nil {
		return (*string)(nil), nil
	}
	jBytes, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}

	rawJSON := json.RawMessage(jBytes)
	return &rawJSON, nil
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
