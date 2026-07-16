// Package converters maps ClickHouse column types to Grafana data-frame converters.
//
// The converter set is built declaratively from a per-primitive registry (registry.go)
// using small generic builders (builders.go). Value-conversion functions live in
// values.go and native SimpleAggregateFunction handling in saf.go. This file holds the
// public surface: the assembled converter list and the type-name lookup.
package converters

import (
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

// ClickhouseConverters is the full, ordered converter set passed to
// sqlutil.FrameFromRows to turn ClickHouse rows into Grafana data frames.
var ClickhouseConverters = ClickHouseConverters()

// ClickHouseConverters assembles the converter list in matching order: the base
// converters (exact-name + regex), then the generated native SimpleAggregateFunction
// converters, then a SAF catch-all that renders any remaining inner type as JSON. The
// catch-all is last so more specific converters win first.
func ClickHouseConverters() []sqlutil.Converter {
	saf := generateSAFConverters()
	list := make([]sqlutil.Converter, 0, len(baseConverters)+len(saf)+1)
	list = append(list, baseConverters...)
	list = append(list, saf...)
	list = append(list, safCatchAll)
	return list
}

// GetConverter returns the converter for a given ClickHouse column type. It unwraps
// LowCardinality(...) and SimpleAggregateFunction(...) to their inner type, then matches
// by exact type name and finally by regex.
func GetConverter(columnType string) sqlutil.Converter {
	// check for 'LowCardinality()' type first and get the converter for the inner type
	if innerType, ok := extractLowCardinalityType(columnType); ok {
		return GetConverter(innerType)
	}

	// check for 'SimpleAggregateFunction()' type and get the converter for the inner type
	if innerType, ok := extractSimpleAggregateFunctionType(columnType); ok {
		return GetConverter(innerType)
	}

	// direct match by name
	for _, c := range baseConverters {
		if c.InputTypeName == columnType {
			return c
		}
	}

	// regex-based search
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

const (
	simpleAggregateFunctionPrefix = "SimpleAggregateFunction("
	simpleAggregateFunctionSuffix = ")"
)

// extractSimpleAggregateFunctionType checks if the column type is a `SimpleAggregateFunction(func, <type>)` type
// and returns the inner data type (the second argument after the function name).
// For example: SimpleAggregateFunction(any, String) -> String
//
//	SimpleAggregateFunction(any, Nullable(String)) -> Nullable(String)
//	SimpleAggregateFunction(anyLast, Array(String)) -> Array(String)
func extractSimpleAggregateFunctionType(columnType string) (string, bool) {
	if !strings.HasPrefix(columnType, simpleAggregateFunctionPrefix) || !strings.HasSuffix(columnType, simpleAggregateFunctionSuffix) {
		return "", false
	}

	// Extract the content between "SimpleAggregateFunction(" and the final ")"
	inner := columnType[len(simpleAggregateFunctionPrefix) : len(columnType)-len(simpleAggregateFunctionSuffix)]

	// Find the first comma that is not inside nested parentheses.
	// The first argument is the function name (e.g., "any", "anyLast"),
	// and the second argument is the data type.
	depth := 0
	for i, ch := range inner {
		switch ch {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				// Everything after ", " is the inner type
				innerType := strings.TrimSpace(inner[i+1:])
				if innerType == "" {
					return "", false
				}
				return innerType, true
			}
		}
	}

	return "", false
}

// findConverterWithRegex searches the base converters using regex matching.
func findConverterWithRegex(columnType string) sqlutil.Converter {
	for _, c := range baseConverters {
		if c.InputTypeRegex != nil && c.InputTypeRegex.MatchString(columnType) {
			return c
		}
	}

	return sqlutil.Converter{}
}
