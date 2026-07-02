package converters

import (
	"fmt"
	"reflect"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

// This file implements native SimpleAggregateFunction (SAF) support. The ClickHouse
// driver scans SAF values into interface{}, and the underlying value is the native Go
// type matching the inner column type (occasionally as a pointer — see the driver
// inconsistency notes below). Two generic converters replace what were previously ~20
// near-identical hand-written functions.

// safConvert extracts a non-nullable native value of type T from a scanned SAF value.
// The driver may hand back either T or *T, so both are accepted.
func safConvert[T any](in any) (any, error) {
	switch v := (*(in.(*any))).(type) {
	case T:
		return v, nil
	case *T:
		return *v, nil
	default:
		return nil, fmt.Errorf("unexpected type %T for SAF %s", v, reflect.TypeFor[T]())
	}
}

// safConvertNullable extracts a nullable native value of type T from a scanned SAF
// value, returning a typed nil pointer for NULL. As with safConvert, the driver may
// hand back *T or a bare T.
func safConvertNullable[T any](in any) (any, error) {
	v := *(in.(*any))
	if v == nil {
		return (*T)(nil), nil
	}
	switch val := v.(type) {
	case *T:
		return val, nil
	case T:
		return &val, nil
	default:
		return nil, fmt.Errorf("unexpected type %T for SAF Nullable(%s)", v, reflect.TypeFor[T]())
	}
}

// safNativeConverter builds a regex-matched converter for SAF columns whose inner type
// is innerPattern (a regex fragment). Scans into interface{}; the driver supplies the
// native value which fn unwraps.
func safNativeConverter(displayName, innerPattern string, ft data.FieldType, fn convertFunc) sqlutil.Converter {
	label := "SimpleAggregateFunction(*, " + displayName + ")"
	return regexConverter(label, `^SimpleAggregateFunction\([^,]+,\s*`+innerPattern+`\)$`, reflect.TypeFor[any](), ft, fn)
}

// safNumeric / safNumericNullable build the native SAF converters for a primitive T.
// They are called once per primitive from the registry (see registry.go).
func safNumeric[T any](name string, ft data.FieldType) sqlutil.Converter {
	return safNativeConverter(name, name, ft, safConvert[T])
}

func safNumericNullable[T any](name string, nft data.FieldType) sqlutil.Converter {
	return safNativeConverter("Nullable("+name+")", `Nullable\(`+name+`\)`, nft, safConvertNullable[T])
}

// safDateTime builds a native SAF converter for a date/time inner type. These carry
// parametric patterns (precision, timezone) so they are listed explicitly below rather
// than derived from a Go type.
func safDateTime(displayName, innerPattern string, nullable bool) sqlutil.Converter {
	if nullable {
		return safNativeConverter(displayName, innerPattern, data.FieldTypeNullableTime, safConvertNullable[time.Time])
	}
	return safNativeConverter(displayName, innerPattern, data.FieldTypeTime, safConvert[time.Time])
}

// safDateTimeConverters are the native SAF converters for date/time inner types. Order
// is not load-bearing (each pattern is end-anchored and mutually exclusive) but mirrors
// the original for readability.
var safDateTimeConverters = []sqlutil.Converter{
	safDateTime("DateTime64", `DateTime64\(\d+(,\s*'[^']*')?\)`, false),
	safDateTime("DateTime", `DateTime(\('[^']*'\))?`, false),
	safDateTime("Date32", `Date32`, false),
	safDateTime("Date", `Date`, false),
	safDateTime("Nullable(DateTime64)", `Nullable\(DateTime64\(\d+(,\s*'[^']*')?\)\)`, true),
	safDateTime("Nullable(DateTime)", `Nullable\(DateTime(\('[^']*'\))?\)`, true),
	safDateTime("Nullable(Date32)", `Nullable\(Date32\)`, true),
	safDateTime("Nullable(Date)", `Nullable\(Date\)`, true),
}

// safCatchAll matches any SAF column whose inner type is not natively handled and
// renders it as JSON. It must be appended LAST so specific converters win first.
var safCatchAll = regexConverter(
	"SimpleAggregateFunction()",
	`^SimpleAggregateFunction\(.*\)`,
	reflect.TypeFor[any](),
	data.FieldTypeJSON,
	jsonConverter,
)

// generateSAFConverters returns the native SAF converters (numeric/bool from the
// registry, then date/time), excluding the catch-all which is appended during assembly.
func generateSAFConverters() []sqlutil.Converter {
	out := make([]sqlutil.Converter, 0, len(safNativeConverters)+len(safDateTimeConverters))
	out = append(out, safNativeConverters...)
	out = append(out, safDateTimeConverters...)
	return out
}
