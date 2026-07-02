package converters

import (
	"encoding/json"
	"math/big"
	"net"
	"testing"

	"github.com/paulmach/orb"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConvert(t *testing.T) {
	t.Run("string passthrough", func(t *testing.T) {
		v, err := defaultConvert("hello")
		require.NoError(t, err)
		assert.Equal(t, "hello", v)
	})
	t.Run("dereferences pointer", func(t *testing.T) {
		v, err := defaultConvert(ref(int64(7)))
		require.NoError(t, err)
		assert.Equal(t, int64(7), v)
	})
	t.Run("non-pointer passthrough", func(t *testing.T) {
		v, err := defaultConvert(int64(7))
		require.NoError(t, err)
		assert.Equal(t, int64(7), v)
	})
	t.Run("nil pointer errors", func(t *testing.T) {
		_, err := defaultConvert((*int64)(nil))
		assert.Error(t, err)
	})
}

func TestJSONConverter(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		v, err := jsonConverter(nil)
		require.NoError(t, err)
		assert.Equal(t, (json.RawMessage)(nil), v)
	})
	t.Run("string", func(t *testing.T) {
		v, err := jsonConverter(`{"a":1}`)
		require.NoError(t, err)
		assert.Equal(t, json.RawMessage(`{"a":1}`), v)
	})
	t.Run("string pointer", func(t *testing.T) {
		v, err := jsonConverter(ref(`{"a":1}`))
		require.NoError(t, err)
		assert.Equal(t, json.RawMessage(`{"a":1}`), v)
	})
	t.Run("bytes", func(t *testing.T) {
		v, err := jsonConverter([]byte(`{"a":1}`))
		require.NoError(t, err)
		assert.Equal(t, json.RawMessage(`{"a":1}`), v)
	})
	t.Run("bytes pointer", func(t *testing.T) {
		b := []byte(`{"a":1}`)
		v, err := jsonConverter(&b)
		require.NoError(t, err)
		assert.Equal(t, json.RawMessage(`{"a":1}`), v)
	})
	t.Run("any wrapper is unwrapped and marshalled", func(t *testing.T) {
		var a any = map[string]int{"a": 1}
		v, err := jsonConverter(&a)
		require.NoError(t, err)
		assert.Equal(t, json.RawMessage(`{"a":1}`), v)
	})
	t.Run("marshal error", func(t *testing.T) {
		_, err := jsonConverter(make(chan int))
		assert.Error(t, err)
	})
}

func TestDecimalConvert(t *testing.T) {
	d := decimal.New(25, 4)
	f, _ := d.Float64()

	t.Run("nil returns zero", func(t *testing.T) {
		v, err := decimalConvert(nil)
		require.NoError(t, err)
		assert.Equal(t, float64(0), v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := decimalConvert(&d)
		require.NoError(t, err)
		assert.Equal(t, f, v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := decimalConvert("nope")
		assert.Error(t, err)
	})
}

func TestDecimalNullConvert(t *testing.T) {
	d := decimal.New(25, 4)
	f, _ := d.Float64()

	t.Run("nil returns zero", func(t *testing.T) {
		v, err := decimalNullConvert(nil)
		require.NoError(t, err)
		assert.Equal(t, float64(0), v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := decimalNullConvert(ref(&d))
		require.NoError(t, err)
		assert.Equal(t, &f, v)
	})
	t.Run("nil inner", func(t *testing.T) {
		v, err := decimalNullConvert(ref((*decimal.Decimal)(nil)))
		require.NoError(t, err)
		assert.Equal(t, (*float64)(nil), v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := decimalNullConvert("nope")
		assert.Error(t, err)
	})
}

func TestBigIntConvert(t *testing.T) {
	b := big.NewInt(5)

	t.Run("nil returns zero", func(t *testing.T) {
		v, err := bigIntConvert(nil)
		require.NoError(t, err)
		assert.Equal(t, float64(0), v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := bigIntConvert(&b)
		require.NoError(t, err)
		assert.Equal(t, bigFloat(5), v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := bigIntConvert("nope")
		assert.Error(t, err)
	})
}

func TestBigIntNullableConvert(t *testing.T) {
	b := big.NewInt(5)

	t.Run("nil returns typed nil", func(t *testing.T) {
		v, err := bigIntNullableConvert(nil)
		require.NoError(t, err)
		assert.Equal(t, (*float64)(nil), v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := bigIntNullableConvert(ref(&b))
		require.NoError(t, err)
		assert.Equal(t, ref(bigFloat(5)), v)
	})
	t.Run("nil inner", func(t *testing.T) {
		v, err := bigIntNullableConvert(ref(ref((*big.Int)(nil))))
		require.NoError(t, err)
		assert.Equal(t, (*float64)(nil), v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := bigIntNullableConvert("nope")
		assert.Error(t, err)
	})
}

func TestIPConvert(t *testing.T) {
	ip := net.ParseIP("127.0.0.1")

	t.Run("nil returns nil", func(t *testing.T) {
		v, err := ipConverter(nil)
		require.NoError(t, err)
		assert.Nil(t, v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := ipConverter(&ip)
		require.NoError(t, err)
		assert.Equal(t, ip.String(), v)
	})
	t.Run("nil pointer returns nil", func(t *testing.T) {
		v, err := ipConverter((*net.IP)(nil))
		require.NoError(t, err)
		assert.Nil(t, v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := ipConverter("nope")
		assert.Error(t, err)
	})
}

func TestIPNullConvert(t *testing.T) {
	ip := net.ParseIP("127.0.0.1")

	t.Run("nil returns nil", func(t *testing.T) {
		v, err := ipNullConverter(nil)
		require.NoError(t, err)
		assert.Nil(t, v)
	})
	t.Run("value", func(t *testing.T) {
		v, err := ipNullConverter(ref(&ip))
		require.NoError(t, err)
		assert.Equal(t, ip.String(), *v.(*string))
	})
	t.Run("nil inner returns nil", func(t *testing.T) {
		v, err := ipNullConverter(ref((*net.IP)(nil)))
		require.NoError(t, err)
		assert.Nil(t, v)
	})
	t.Run("invalid type errors", func(t *testing.T) {
		_, err := ipNullConverter("nope")
		assert.Error(t, err)
	})
}

func TestPointConvert(t *testing.T) {
	t.Run("nil returns nil", func(t *testing.T) {
		v, err := pointConverter(nil)
		require.NoError(t, err)
		assert.Nil(t, v)
	})
	t.Run("value", func(t *testing.T) {
		var in any = orb.Point{10, 10}
		v, err := pointConverter(&in)
		require.NoError(t, err)
		want, _ := toJson(orb.Point{10, 10})
		assert.Equal(t, want, v.(json.RawMessage))
	})
	t.Run("invalid type errors", func(t *testing.T) {
		var in any = "not a point"
		_, err := pointConverter(&in)
		assert.Error(t, err)
	})
}
