package converters

import (
	"reflect"
	"testing"
)

// benchSink prevents the compiler from optimizing benchmark work away.
var benchSink any

// BenchmarkScanType_TypeFor and BenchmarkScanType_PointerToTypeOf compare the two ways
// of building a *T scan type. Both run only at package init in production, so this bounds
// init cost only — it demonstrates the reflect.TypeFor form is equal-or-cheaper and, unlike
// reflect.PointerTo, performs no ptrMap sync.Map lookup.
func BenchmarkScanType_TypeFor(b *testing.B) {
	var t reflect.Type
	for i := 0; i < b.N; i++ {
		t = reflect.TypeFor[*int64]()
	}
	benchSink = t
}

func BenchmarkScanType_PointerToTypeOf(b *testing.B) {
	var t reflect.Type
	for i := 0; i < b.N; i++ {
		t = reflect.PointerTo(reflect.TypeOf(int64(0)))
	}
	benchSink = t
}

// BenchmarkConverterHotPath measures the per-row conversion cost — the actual query path.
// The converter's ConverterFunc (defaultConvert here) never calls reflect.TypeFor, so the
// refactor adds no per-row reflection.
func BenchmarkConverterHotPath(b *testing.B) {
	sut := GetConverter("Int64")
	v := int64(42)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		out, _ := sut.FrameConverter.ConverterFunc(&v)
		benchSink = out
	}
}

// BenchmarkSAFConvertHotPath measures the per-row cost of a native SAF converter (the new
// generic safConvert), the other value path touched by the refactor.
func BenchmarkSAFConvertHotPath(b *testing.B) {
	sut := findByRegex("SimpleAggregateFunction(any, Int64)")
	var in any = int64(42)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		out, _ := sut.FrameConverter.ConverterFunc(&in)
		benchSink = out
	}
}
