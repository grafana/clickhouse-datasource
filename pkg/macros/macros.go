package macros

import (
		"fmt"
		"math"
		"strings"
		"time"

		"github.com/grafana/sqlds/v3"
	
		"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
)

// Converts a time.Time to a Date
func timeToDate(t time.Time) string {
		return fmt.Sprintf("toDate('%s')", t.Format("2006-01-02"))
}

// Converts a time.Time to a UTC DateTime with seconds precision
func timeToDateTime(t time.Time) string {
		return fmt.Sprintf("toDateTime(%d)", t.Unix())
}

// Converts a time.Time to a UTC DateTime64 with milliseconds precision
func timeToDateTime64(t time.Time) string {
		return fmt.Sprintf("fromUnixTimestamp64Milli(%d)", t.UnixMilli())
}

// FromTimeFilter returns a time filter expression based on grafana's timepicker's "from" time in seconds
func FromTimeFilter(query *sqlutil.Query, args []string) (string, error) {
		return timeToDateTime(query.TimeRange.From), nil
}

// ToTimeFilter returns a time filter expression based on grafana's timepicker's "to" time in seconds
func ToTimeFilter(query *sqlutil.Query, args []string) (string, error) {
		return timeToDateTime(query.TimeRange.To), nil
}

// FromTimeFilterMs returns a time filter expression based on grafana's timepicker's "from" time in milliseconds
func FromTimeFilterMs(query *sqlutil.Query, args []string) (string, error) {
		return timeToDateTime64(query.TimeRange.From), nil
}

// ToTimeFilterMs returns a time filter expression based on grafana's timepicker's "to" time in milliseconds
func ToTimeFilterMs(query *sqlds.Query, args []string) (string, error) {
		return timeToDateTime64(query.TimeRange.To), nil
}

func TimeFilter(query *sqlds.Query, args []string) (string, error) {
		if len(args) != 1 {
				return "", fmt.Errorf("%w: expected 1 argument, received %d", sqlds.ErrorBadArgumentCount, len(args))
		}

		var (
				column = args[0]
				from   = query.TimeRange.From
				to     = query.TimeRange.To
		)

		return fmt.Sprintf("%s >= %s AND %s <= %s", column, timeToDateTime(from), column, timeToDateTime(to)), nil
}

func TimeFilterMs(query *sqlds.Query, args []string) (string, error) {
		if len(args) != 1 {
				return "", fmt.Errorf("%w: expected 1 argument, received %d", sqlds.ErrorBadArgumentCount, len(args))
		}

		var (
				column = args[0]
				from   = query.TimeRange.From
				to     = query.TimeRange.To
		)

		return fmt.Sprintf("%s >= %s AND %s <= %s", column, timeToDateTime64(from), column, timeToDateTime64(to)), nil
}

func DateFilter(query *sqlds.Query, args []string) (string, error) {
		if len(args) != 1 {
				return "", fmt.Errorf("%w: expected 1 argument, received %d", sqlds.ErrorBadArgumentCount, len(args))
		}
		var (
				column = args[0]
				from   = query.TimeRange.From
				to     = query.TimeRange.To
		)

		return fmt.Sprintf("%s >= %s AND %s <= %s", column, timeToDate(from), column, timeToDate(to)), nil
}

func TimeInterval(query *sqlds.Query, args []string) (string, error) {
		if len(args) != 1 {
				return "", fmt.Errorf("%w: expected 1 argument, received %d", sqlds.ErrorBadArgumentCount, len(args))
		}

		seconds := math.Max(query.Interval.Seconds(), 1)
		return fmt.Sprintf("toStartOfInterval(toDateTime(%s), INTERVAL %d second)", args[0], int(seconds)), nil
}

func TimeIntervalMs(query *sqlds.Query, args []string) (string, error) {
		if len(args) != 1 {
				return "", fmt.Errorf("%w: expected 1 argument, received %d", sqlds.ErrorBadArgumentCount, len(args))
		}

		milliseconds := math.Max(float64(query.Interval.Milliseconds()), 1)
		return fmt.Sprintf("toStartOfInterval(toDateTime64(%s, 3), INTERVAL %d millisecond)", args[0], int(milliseconds)), nil
}

func IntervalSeconds(query *sqlds.Query, args []string) (string, error) {
		seconds := math.Max(query.Interval.Seconds(), 1)
		return fmt.Sprintf("%d", int(seconds)), nil
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

// IsValidComparisonPredicates checks for a string and return true if it is a valid SQL comparison predicate
func IsValidComparisonPredicates(comparison_predicates string) bool {
		switch comparison_predicates {
		case "=", "!=", "<>", "<", "<=", ">", ">=":
				return true
		}
		return false
}

// Macros is a map of all macro functions
var Macros = map[string]sqlds.MacroFunc{
		"fromTime":        FromTimeFilter,
		"toTime":          ToTimeFilter,
		"fromTime_ms":     FromTimeFilterMs,
		"toTime_ms":       ToTimeFilterMs,
		"timeFilter":      TimeFilter,
		"timeFilter_ms":   TimeFilterMs,
		"dateFilter":      DateFilter,
		"timeInterval":    TimeInterval,
		"timeInterval_ms": TimeIntervalMs,
		"interval_s":      IntervalSeconds,
}
