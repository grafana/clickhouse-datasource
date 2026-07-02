package converters

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net"
	"reflect"

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
