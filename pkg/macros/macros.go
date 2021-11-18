package macros

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/grafana/sqlds"
)

var (
	ErrorNoArgumentsToMacro           = errors.New("expected minimum of 1 arumgent. But no argument found")
	ErrorInsufficientArgumentsToMacro = errors.New("expected number of arguments not matching")
)

// TimeFilter returns time filter query based on grafana's timepicker's time range
func TimeFilter(query *sqlds.Query, args []string) (string, error) {
	args = RemoveQuotesInArgs(args)
	if len(args) < 1 {
		return "", ErrorNoArgumentsToMacro
	}
	var (
		column = args[0]
		from   = query.TimeRange.From.UTC().Format(time.RFC3339)
		to     = query.TimeRange.To.UTC().Format(time.RFC3339)
	)
	if len(args) == 1 {
		return fmt.Sprintf("\"%s\" > '%s' AND \"%s\" < '%s'", column, from, column, to), nil
	}

	format := args[1]
	if !strings.HasPrefix(format, "epoch") && !strings.HasPrefix(format, "unix") {
		return fmt.Sprintf("TO_TIMESTAMP(\"%s\",'%s') > '%s' AND TO_TIMESTAMP(\"%s\",'%s') < '%s'", column, format, from, column, format, to), nil
	}
	if len(args) == 2 {
		switch strings.ToLower(format) {
		case "epoch", "epoch_s", "unix", "unix_s":
			return TimeFilterEpoch(query, []string{column, "s"})
		case "epoch_ms", "unix_ms":
			return TimeFilterEpoch(query, []string{column, "ms"})
		case "epoch_ns", "unix_ns":
			return TimeFilterEpoch(query, []string{column, "ns"})
		}
		return TimeFilterEpoch(query, []string{column, "s"})
	}

	epoch_format := args[2]
	return TimeFilterEpoch(query, []string{column, epoch_format})
}

// TimeFilterEpoch returns time filter query based on grafana's timepicker's time range over epoch time fields
func TimeFilterEpoch(query *sqlds.Query, args []string) (string, error) {
	args = RemoveQuotesInArgs(args)
	if len(args) < 1 {
		return "", ErrorNoArgumentsToMacro
	}
	var (
		column = args[0]
		from   = query.TimeRange.From.Unix()
		to     = query.TimeRange.To.Unix()
		format = "s"
	)
	if len(args) >= 2 && args[1] != "" {
		format = args[1]
		format = strings.ToLower(format)
	}
	switch format {
	case "s":
		from = query.TimeRange.From.Unix()
		to = query.TimeRange.To.Unix()
	case "ms":
		from = query.TimeRange.From.Unix() * 1000
		to = query.TimeRange.To.Unix() * 1000
	case "ns":
		from = query.TimeRange.From.UnixNano()
		to = query.TimeRange.To.UnixNano()
	}
	return fmt.Sprintf("\"%s\" > '%d' AND \"%s\" < '%d'", column, from, column, to), nil
}

type customGrafanaTimeFilterQueryType string

const (
	customGrafanaTimeFilterQueryTypeFrom customGrafanaTimeFilterQueryType = "from"
	customGrafanaTimeFilterQueryTypeTo   customGrafanaTimeFilterQueryType = "to"
)

func customGrafanaTimeFilter(queryType customGrafanaTimeFilterQueryType, query *sqlds.Query, args []string) (string, error) {
	args = RemoveQuotesInArgs(args)
	if len(args) < 1 {
		return "", ErrorNoArgumentsToMacro
	}
	var (
		column    = args[0]
		timestamp = query.TimeRange.From.UTC().Format(time.RFC3339)
		operand   = ">"
	)
	if queryType == customGrafanaTimeFilterQueryTypeTo {
		operand = "<"
		timestamp = query.TimeRange.To.UTC().Format(time.RFC3339)
	}
	if len(args) > 1 && IsValidComparisonPredicates(args[len(args)-1]) {
		operand = args[len(args)-1]
	}
	if len(args) > 1 && !IsValidComparisonPredicates(args[1]) {
		format := args[1]
		switch format {
		case "epoch", "epoch_s":
			return fmt.Sprintf("ADD_SECONDS( '1970-01-01', \"%s\" ) %s '%s'", column, operand, timestamp), nil
		case "epoch_ms":
			return fmt.Sprintf("ADD_SECONDS( '1970-01-01', (\"%s\" / 1000)) %s '%s'", column, operand, timestamp), nil
		case "epoch_ns":
			return fmt.Sprintf("ADD_SECONDS( '1970-01-01', (\"%s\" / 1000000000)) %s '%s'", column, operand, timestamp), nil
		default:
			return fmt.Sprintf("TO_TIMESTAMP(\"%s\",'%s') %s '%s'", column, format, operand, timestamp), nil
		}
	}
	return fmt.Sprintf("\"%s\" %s '%s'", column, operand, timestamp), nil
}

// FromTimeFilter return time filter query based on grafana's timepicker's from time
func FromTimeFilter(query *sqlds.Query, args []string) (string, error) {
	return customGrafanaTimeFilter(customGrafanaTimeFilterQueryTypeFrom, query, args)
}

// FromTimeFilter return time filter query based on grafana's timepicker's to time
func ToTimeFilter(query *sqlds.Query, args []string) (string, error) {
	return customGrafanaTimeFilter(customGrafanaTimeFilterQueryTypeTo, query, args)
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
