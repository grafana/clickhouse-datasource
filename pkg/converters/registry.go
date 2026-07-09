package converters

import (
	"net"
	"reflect"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/shopspring/decimal"
)

// baseConverters holds every converter consulted by GetConverter and placed first in
// the assembled ClickHouseConverters list: exact-name converters (numerics, bool,
// strings, big integers) and regex converters (Date, Decimal, IP, the JSON family, ...).
//
// safNativeConverters holds the generated native SimpleAggregateFunction converters for
// numeric/bool inner types. Together with the date/time entries and catch-all in saf.go
// they form the full SAF handling.
//
// Both slices are produced from a single per-primitive registration (see addNumeric), so
// each primitive type — its base, nullable, native SAF and nullable native SAF converters —
// is declared exactly once.
var baseConverters, safNativeConverters = buildRegistry()

// addNumeric registers one primitive type T, emitting its four converters: base scalar
// and nullable scalar (exact-name → base) plus native SAF and nullable native SAF
// (regex → saf).
func addNumeric[T any](base, saf *[]sqlutil.Converter, name string, ft, nft data.FieldType) {
	*base = append(*base,
		scalar[T](name, ft),
		nullableScalar[T]("Nullable("+name+")", nft),
	)
	*saf = append(*saf,
		safNumeric[T](name, ft),
		safNumericNullable[T](name, nft),
	)
}

func buildRegistry() (base, saf []sqlutil.Converter) {
	// Numeric and bool primitives — single source of truth, one line per type.
	addNumeric[uint8](&base, &saf, "UInt8", data.FieldTypeUint8, data.FieldTypeNullableUint8)
	addNumeric[uint16](&base, &saf, "UInt16", data.FieldTypeUint16, data.FieldTypeNullableUint16)
	addNumeric[uint32](&base, &saf, "UInt32", data.FieldTypeUint32, data.FieldTypeNullableUint32)
	addNumeric[uint64](&base, &saf, "UInt64", data.FieldTypeUint64, data.FieldTypeNullableUint64)
	addNumeric[int8](&base, &saf, "Int8", data.FieldTypeInt8, data.FieldTypeNullableInt8)
	addNumeric[int16](&base, &saf, "Int16", data.FieldTypeInt16, data.FieldTypeNullableInt16)
	addNumeric[int32](&base, &saf, "Int32", data.FieldTypeInt32, data.FieldTypeNullableInt32)
	addNumeric[int64](&base, &saf, "Int64", data.FieldTypeInt64, data.FieldTypeNullableInt64)
	addNumeric[float32](&base, &saf, "Float32", data.FieldTypeFloat32, data.FieldTypeNullableFloat32)
	addNumeric[float64](&base, &saf, "Float64", data.FieldTypeFloat64, data.FieldTypeNullableFloat64)
	addNumeric[bool](&base, &saf, "Bool", data.FieldTypeBool, data.FieldTypeNullableBool)

	// Other exact-name converters. Order among exact-name entries is irrelevant (names
	// are unique), so they are grouped here for readability.
	base = append(base,
		scalar[string]("String", data.FieldTypeString),
		scalar[string]("LowCardinality(String)", data.FieldTypeString),
		bigInt("Int128", false),
		bigInt("Nullable(Int128)", true),
		bigInt("Int256", false),
		bigInt("Nullable(Int256)", true),
		bigInt("UInt128", false),
		bigInt("Nullable(UInt128)", true),
		bigInt("UInt256", false),
		bigInt("Nullable(UInt256)", true),
	)

	// Regex converters. Their RELATIVE ORDER is load-bearing: sqlutil takes the first
	// converter whose regex matches, so this mirrors the original declaration order.
	// (Exact-name converters above never conflict — no regex here matches a bare type
	// name like "Int64" or "String".)
	base = append(base,
		regexConverter("Enum", `^Enum(8|16)\(.*\)`, reflect.TypeFor[*string](), data.FieldTypeString, defaultConvert),
		regexConverter("Nullable(Enum)", `^Nullable\(Enum(8|16)\(.*\)\)`, reflect.TypeFor[**string](), data.FieldTypeNullableString, defaultConvert),
		regexConverter("Date", `^Date\(?`, reflect.TypeFor[*time.Time](), data.FieldTypeTime, defaultConvert),
		regexConverter("Nullable(Date)", `^Nullable\(Date\(?`, reflect.TypeFor[**time.Time](), data.FieldTypeNullableTime, defaultConvert),
		regexConverter("Nullable(String)", `^Nullable\(String`, reflect.TypeFor[**string](), data.FieldTypeNullableString, defaultConvert),
		regexConverter("Decimal", `^Decimal`, reflect.TypeFor[*decimal.Decimal](), data.FieldTypeFloat64, decimalConvert),
		regexConverter("Nullable(Decimal)", `^Nullable\(Decimal`, reflect.TypeFor[**decimal.Decimal](), data.FieldTypeNullableFloat64, decimalNullConvert),
		jsonType("Tuple()", `^Tuple\(.*\)`),
		jsonType("Variant", `^Variant`),
		jsonType("Dynamic", `^Dynamic`),
		jsonType("JSON", `^JSON`),
		jsonType("Nullable(JSON)", `^Nullable\(JSON`),
		regexConverter("Nested()", `^Nested\(.*\)`, reflect.TypeFor[[]map[string]any](), data.FieldTypeJSON, jsonConverter),
		jsonType("Array()", `^Array\(.*\)`),
		jsonType("Map()", `^Map\(.*\)`),
		regexConverter("FixedString()", `^Nullable\(FixedString\(.*\)\)`, reflect.TypeFor[**string](), data.FieldTypeNullableString, defaultConvert),
		regexConverter("IP", `^IPv[46]`, reflect.TypeFor[*net.IP](), data.FieldTypeString, ipConverter),
		regexConverter("Nullable(IP)", `^Nullable\(IP`, reflect.TypeFor[**net.IP](), data.FieldTypeNullableString, ipNullConverter),
		regexConverter("SimpleAggregateFunction(String)", `^SimpleAggregateFunction\([^,]+,\s*String\)$`, reflect.TypeFor[*string](), data.FieldTypeString, defaultConvert),
		regexConverter("SimpleAggregateFunction(Nullable(String))", `^SimpleAggregateFunction\([^,]+,\s*Nullable\(String\)\)$`, reflect.TypeFor[**string](), data.FieldTypeNullableString, defaultConvert),
		regexConverter("Point", `^Point`, reflect.TypeFor[any](), data.FieldTypeJSON, pointConverter),
		regexConverter("LowCardinality(Nullable(String))", `^LowCardinality\(Nullable([^)]*)\)`, reflect.TypeFor[**string](), data.FieldTypeNullableString, defaultConvert),
	)

	return base, saf
}
