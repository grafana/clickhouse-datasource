package converters

import (
	"encoding"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net"
	"reflect"
	"strconv"

	"github.com/ClickHouse/clickhouse-go/v2/lib/chcol"
	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
)

// This file holds the value-conversion functions: given a scanned SQL value they
// produce the value placed into a Grafana data frame field. They are referenced by
// the converter builders in builders.go, registry.go and saf.go.

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
		// encoding/json rejects NaN and ±Inf, which ClickHouse Tuple/Map/Nested/
		// Variant/Dynamic/JSON columns can legitimately contain. Replace those
		// values with null and retry once
		// (https://github.com/grafana/clickhouse-datasource/issues/1049).
		//
		// The retry is gated on json.UnsupportedValueError (the error NaN/±Inf
		// produce) so unrelated marshal failures surface immediately and the
		// common path keeps its original behavior.
		var unsupported *json.UnsupportedValueError
		if !errors.As(err, &unsupported) {
			return nil, err
		}

		sanitized, sErr := sanitizeJSONFloats(in, 0)
		if sErr != nil {
			return nil, sErr
		}
		jBytes, err = json.Marshal(sanitized)
	}
	if err != nil {
		return nil, err
	}

	return json.RawMessage(jBytes), nil
}

// sanitizeJSONMaxDepth bounds the recursion in sanitizeJSONFloats so a pathological
// value (deep nesting or a reference cycle) cannot overflow the stack; past the
// limit the value is returned as-is and the subsequent json.Marshal reports the error.
const sanitizeJSONMaxDepth = 1000

// sanitizeJSONFloats returns a copy of in with every NaN or ±Inf floating point
// value (at any nesting depth) replaced by nil, so the result can be encoded by
// encoding/json. Byte slices are left untouched so they keep marshaling as base64
// strings; map keys are rendered exactly as encoding/json would so sanitized rows
// stay consistent with untouched rows in the same column.
func sanitizeJSONFloats(in any, depth int) (any, error) {
	if depth > sanitizeJSONMaxDepth {
		return in, nil
	}

	// The ClickHouse JSON wrapper types implement json.Marshaler over unexported
	// fields, so reflection cannot reach the offending floats. Handle them via
	// their public accessors instead. chcol.Dynamic is an alias of chcol.Variant.
	switch v := in.(type) {
	case chcol.Variant:
		return sanitizeJSONFloats(v.Any(), depth+1)
	case *chcol.Variant:
		if v == nil {
			return nil, nil
		}
		return sanitizeJSONFloats(v.Any(), depth+1)
	case chcol.JSON:
		return sanitizeJSONFloats(v.NestedMap(), depth+1)
	case *chcol.JSON:
		if v == nil {
			return nil, nil
		}
		return sanitizeJSONFloats(v.NestedMap(), depth+1)
	}

	rv := reflect.ValueOf(in)
	if !rv.IsValid() {
		return nil, nil
	}

	switch rv.Kind() {
	case reflect.Float32, reflect.Float64:
		if f := rv.Float(); math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, nil
		}
		return in, nil
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil, nil
		}
		return sanitizeJSONFloats(rv.Elem().Interface(), depth+1)
	case reflect.Slice:
		// Preserve byte slices; json encodes them as base64 strings.
		if rv.Type().Elem().Kind() == reflect.Uint8 {
			return in, nil
		}
		fallthrough
	case reflect.Array:
		out := make([]any, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			s, err := sanitizeJSONFloats(rv.Index(i).Interface(), depth+1)
			if err != nil {
				return nil, err
			}
			out[i] = s
		}
		return out, nil
	case reflect.Map:
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			key, err := jsonMapKey(iter.Key())
			if err != nil {
				return nil, err
			}
			val, err := sanitizeJSONFloats(iter.Value().Interface(), depth+1)
			if err != nil {
				return nil, err
			}
			out[key] = val
		}
		return out, nil
	default:
		return in, nil
	}
}

// jsonMapKey renders a map key the same way encoding/json does, so a sanitized row
// produces the same key strings as clean rows in the same column: string keys pass
// through, encoding.TextMarshaler keys (e.g. time.Time) use MarshalText, and integer
// keys are formatted numerically.
func jsonMapKey(k reflect.Value) (string, error) {
	if k.Kind() == reflect.String {
		return k.String(), nil
	}
	if tm, ok := k.Interface().(encoding.TextMarshaler); ok {
		if k.Kind() == reflect.Pointer && k.IsNil() {
			return "", nil
		}
		b, err := tm.MarshalText()
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
	switch k.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return strconv.FormatInt(k.Int(), 10), nil
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return strconv.FormatUint(k.Uint(), 10), nil
	default:
		return fmt.Sprint(k.Interface()), nil
	}
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
