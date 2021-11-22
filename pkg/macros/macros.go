package macros

import (
	"errors"
	"fmt"
	"strings"

	"github.com/grafana/sqlds"
)

var (
	ErrorNoArgumentsToMacro           = errors.New("expected minimum of 1 arumgent. But no argument found")
	ErrorInsufficientArgumentsToMacro = errors.New("expected number of arguments not matching")
)

type timeQueryType string

const (
	timeQueryTypeFrom timeQueryType = "from"
	timeQueryTypeTo   timeQueryType = "to"
)

func newTimeFilter(queryType timeQueryType, query *sqlds.Query) (string, error) {
	date := query.TimeRange.From
	if queryType == timeQueryTypeTo {
		date = query.TimeRange.To
	}
	return fmt.Sprintf("toDateTime(intDiv(%d,1000))", date.UnixMilli()), nil
}

// FromTimeFilter return time filter query based on grafana's timepicker's from time
func FromTimeFilter(query *sqlds.Query, args []string) (string, error) {
	return newTimeFilter(timeQueryTypeFrom, query)
}

// FromTimeFilter return time filter query based on grafana's timepicker's to time
func ToTimeFilter(query *sqlds.Query, args []string) (string, error) {
	return newTimeFilter(timeQueryTypeTo, query)
}

// RemoveQuotesInArgs remove all quotes from macro arguments and return
func RemoveQuotesInArgs(args []string) []string {
	updatedArgs := []string{}
	for _, arg := range args {
		replacer := strings.NewReplacer(
			"\"", "",
			"'", "",
		)
		updatedArgs = append(updatedArgs, replacer.Replace(arg))
	}
	return updatedArgs
}

// IsValidComparisonPredicates checks for a string and return true if it is a valid SQL comparision predicate
func IsValidComparisonPredicates(comparison_predicates string) bool {
	switch comparison_predicates {
	case "=", "!=", "<>", "<", "<=", ">", ">=":
		return true
	}
	return false
}
