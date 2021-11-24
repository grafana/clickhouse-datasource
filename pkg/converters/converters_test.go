package converters_test

import (
	"strings"
	"testing"

	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/stretchr/testify/assert"
)

func TestConverters(t *testing.T) {
	conv := converters.ClickHouseConverters()
	types := converters.NumericTypes()
	types = append(types, converters.WILDCARD_TYPES...)
	for _, c := range conv {
		contains := false
		for _, v := range types {
			if strings.Contains(c.InputTypeName, v) {
				contains = true
				break
			}
		}
		assert.True(t, contains)
	}
	assert.Equal(t, 24, len(conv))
}
