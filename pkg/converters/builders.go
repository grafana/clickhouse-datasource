package converters

import (
	"math/big"
	"reflect"
	"regexp"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

// This file holds small, declarative builders for sqlutil.Converter values. They
// exist to remove the repetitive reflect boilerplate from the converter registry.
//
// Scan types are obtained with reflect.TypeFor[*T]() / reflect.TypeFor[**T]()
// rather than reflect.PointerTo(reflect.TypeOf(zero)). For a statically known T
// this reads a compile-time type descriptor: no value boxing, no allocation, and
// no ptrMap sync.Map lookup. All builders run once, at package initialization, so
// they add no per-row/query cost — the hot path only reads the precomputed
// InputScanType field.

// scalar builds an exact-name converter that scans into *T and reports FieldType ft.
// Values are unwrapped by defaultConvert, matching the plain numeric/string/bool
// converters (e.g. Int64, Bool, String).
func scalar[T any](name string, ft data.FieldType) sqlutil.Converter {
	return named(name, reflect.TypeFor[*T](), ft, defaultConvert)
}

// nullableScalar builds an exact-name converter that scans into **T and reports ft.
// Matches the plain Nullable(...) numeric converters (e.g. Nullable(Int64)).
func nullableScalar[T any](name string, ft data.FieldType) sqlutil.Converter {
	return named(name, reflect.TypeFor[**T](), ft, defaultConvert)
}

// bigInt builds an exact-name converter for the 128/256-bit integer types, which
// scan into **big.Int (base) or ***big.Int (nullable) and are rendered as float64.
func bigInt(name string, nullable bool) sqlutil.Converter {
	if nullable {
		return named(name, reflect.TypeFor[***big.Int](), data.FieldTypeNullableFloat64, bigIntNullableConvert)
	}
	return named(name, reflect.TypeFor[**big.Int](), data.FieldTypeFloat64, bigIntConvert)
}

// jsonType builds a regex-matched converter for the JSON-shaped types (Tuple,
// Variant, Dynamic, JSON, Array, Map, ...): scan into interface{}, render as JSON.
func jsonType(name, pattern string) sqlutil.Converter {
	return regexConverter(name, pattern, reflect.TypeFor[any](), data.FieldTypeJSON, jsonConverter)
}

// named builds a converter matched by its exact type name (InputTypeName == dbType).
func named(name string, scan reflect.Type, ft data.FieldType, fn convertFunc) sqlutil.Converter {
	return converter(name, nil, scan, ft, fn)
}

// regexConverter builds a converter matched by regex against the column type.
func regexConverter(name, pattern string, scan reflect.Type, ft data.FieldType, fn convertFunc) sqlutil.Converter {
	return converter(name, regexp.MustCompile(pattern), scan, ft, fn)
}

type convertFunc = func(in interface{}) (interface{}, error)

// converter is the single place that assembles a sqlutil.Converter, keeping the
// InputTypeName/InputTypeRegex/FrameConverter wiring in one spot.
func converter(name string, re *regexp.Regexp, scan reflect.Type, ft data.FieldType, fn convertFunc) sqlutil.Converter {
	return sqlutil.Converter{
		Name:           name,
		InputScanType:  scan,
		InputTypeName:  name,
		InputTypeRegex: re,
		FrameConverter: sqlutil.FrameConverter{
			FieldType:     ft,
			ConverterFunc: fn,
		},
	}
}
