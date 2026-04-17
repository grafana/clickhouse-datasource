package macros

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/macropro"
)

// timeToDate converts a time.Time to a ClickHouse Date literal.
func timeToDate(t time.Time) string {
	return fmt.Sprintf("toDate('%s')", t.Format("2006-01-02"))
}

// timeToDateTime converts a time.Time to a ClickHouse DateTime (seconds precision).
func timeToDateTime(t time.Time) string {
	return fmt.Sprintf("toDateTime(%d)", t.Unix())
}

// timeToDateTime64 converts a time.Time to a ClickHouse DateTime64 (milliseconds precision).
func timeToDateTime64(t time.Time) string {
	return fmt.Sprintf("fromUnixTimestamp64Milli(%d)", t.UnixMilli())
}

// contextFrom builds a macropro QueryContext from a sqlds Query.
func contextFrom(q *sqlutil.Query) macropro.QueryContext[struct{}] {
	return macropro.QueryContext[struct{}]{
		TimeRange: macropro.TimeRange{
			From: q.TimeRange.From,
			To:   q.TimeRange.To,
		},
		Interval:   q.Interval,
		IntervalMS: q.Interval.Milliseconds(),
		Table:      q.Table,
		Column:     q.Column,
	}
}

// FromTimeFilter returns toDateTime(<from_unix>) for the query time range start.
func FromTimeFilter(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	return timeToDateTime(ctx.TimeRange.From), nil
}

// ToTimeFilter returns toDateTime(<to_unix>) for the query time range end.
func ToTimeFilter(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	return timeToDateTime(ctx.TimeRange.To), nil
}

// FromTimeFilterMs returns fromUnixTimestamp64Milli(<from_ms>) for the query time range start.
func FromTimeFilterMs(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	return timeToDateTime64(ctx.TimeRange.From), nil
}

// ToTimeFilterMs returns fromUnixTimestamp64Milli(<to_ms>) for the query time range end.
func ToTimeFilterMs(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	return timeToDateTime64(ctx.TimeRange.To), nil
}

// TimeFilter returns a seconds-precision time range filter expression.
// $__timeFilter(col) → col >= toDateTime(<from>) AND col <= toDateTime(<to>)
func TimeFilter(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeFilter requires 1 argument, received %d", len(args))
	}
	col := args[0]
	return fmt.Sprintf("%s >= %s AND %s <= %s", col, timeToDateTime(ctx.TimeRange.From), col, timeToDateTime(ctx.TimeRange.To)), nil
}

// TimeFilterMs returns a millisecond-precision time range filter expression.
// $__timeFilter_ms(col) → col >= fromUnixTimestamp64Milli(<from>) AND col <= fromUnixTimestamp64Milli(<to>)
func TimeFilterMs(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeFilter_ms requires 1 argument, received %d", len(args))
	}
	col := args[0]
	return fmt.Sprintf("%s >= %s AND %s <= %s", col, timeToDateTime64(ctx.TimeRange.From), col, timeToDateTime64(ctx.TimeRange.To)), nil
}

// DateFilter returns a date-only range filter expression.
// $__dateFilter(col) → col >= toDate('YYYY-MM-DD') AND col <= toDate('YYYY-MM-DD')
func DateFilter(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("dateFilter requires 1 argument, received %d", len(args))
	}
	col := args[0]
	return fmt.Sprintf("%s >= %s AND %s <= %s", col, timeToDate(ctx.TimeRange.From), col, timeToDate(ctx.TimeRange.To)), nil
}

// DateTimeFilter returns a combined date+time range filter for separate date and time columns.
// $__dateTimeFilter(dateCol, timeCol) → (dateCol >= toDate(...) AND ...) AND (timeCol >= toDateTime(...) AND ...)
func DateTimeFilter(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 2 {
		return "", fmt.Errorf("dateTimeFilter requires 2 arguments, received %d", len(args))
	}
	dateCol, timeCol := args[0], args[1]
	dateFilter := fmt.Sprintf("(%s >= %s AND %s <= %s)", dateCol, timeToDate(ctx.TimeRange.From), dateCol, timeToDate(ctx.TimeRange.To))
	timeFilter := fmt.Sprintf("(%s >= %s AND %s <= %s)", timeCol, timeToDateTime(ctx.TimeRange.From), timeCol, timeToDateTime(ctx.TimeRange.To))
	return fmt.Sprintf("%s AND %s", dateFilter, timeFilter), nil
}

// TimeInterval returns a ClickHouse toStartOfInterval expression with seconds precision.
// $__timeInterval(col) → toStartOfInterval(toDateTime(col), INTERVAL N second)
func TimeInterval(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeInterval requires 1 argument, received %d", len(args))
	}
	seconds := math.Max(ctx.Interval.Seconds(), 1)
	return fmt.Sprintf("toStartOfInterval(toDateTime(%s), INTERVAL %d second)", args[0], int(seconds)), nil
}

// TimeIntervalMs returns a ClickHouse toStartOfInterval expression with milliseconds precision.
// $__timeInterval_ms(col) → toStartOfInterval(toDateTime64(col, 3), INTERVAL N millisecond)
func TimeIntervalMs(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeInterval_ms requires 1 argument, received %d", len(args))
	}
	ms := math.Max(float64(ctx.IntervalMS), 1)
	return fmt.Sprintf("toStartOfInterval(toDateTime64(%s, 3), INTERVAL %d millisecond)", args[0], int(ms)), nil
}

// IntervalSeconds returns the query interval in whole seconds (minimum 1).
// $__interval_s → N
func IntervalSeconds(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	seconds := math.Max(ctx.Interval.Seconds(), 1)
	return fmt.Sprintf("%d", int(seconds)), nil
}

// TimeFrom overrides the dialect-neutral $__timeFrom default with a
// ClickHouse-native filter expression. sqlutil's default renders an
// RFC 3339 string literal that only works via implicit String→DateTime
// coercion; ClickHouse's DateTime functions are explicit and cheaper.
// $__timeFrom(col) → col >= toDateTime(<from_unix>)
func TimeFrom(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeFrom requires 1 argument, received %d", len(args))
	}
	return fmt.Sprintf("%s >= %s", args[0], timeToDateTime(ctx.TimeRange.From)), nil
}

// TimeTo is the ClickHouse-native counterpart to TimeFrom.
// $__timeTo(col) → col <= toDateTime(<to_unix>)
func TimeTo(ctx macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 1 {
		return "", fmt.Errorf("timeTo requires 1 argument, received %d", len(args))
	}
	return fmt.Sprintf("%s <= %s", args[0], timeToDateTime(ctx.TimeRange.To)), nil
}

// TimeGroup overrides sqlutil's SQL-Server-style datepart() output — which
// is invalid syntax in ClickHouse — with toStartOfInterval, the ClickHouse
// idiom for time bucketing.
// $__timeGroup(col, 5m) → toStartOfInterval(toDateTime(col), INTERVAL 300 second)
func TimeGroup(_ macropro.QueryContext[struct{}], args []string) (string, error) {
	if len(args) != 2 {
		return "", fmt.Errorf("timeGroup requires 2 arguments, received %d", len(args))
	}
	col := strings.TrimSpace(args[0])
	periodStr := strings.Trim(strings.TrimSpace(args[1]), "'\"")

	d, err := time.ParseDuration(periodStr)
	if err != nil {
		return "", fmt.Errorf("timeGroup: invalid interval %q: %w", periodStr, err)
	}
	secs := int64(math.Round(d.Seconds()))
	if secs <= 0 {
		return "", fmt.Errorf("timeGroup: interval must be positive, got %q", periodStr)
	}
	return fmt.Sprintf("toStartOfInterval(toDateTime(%s), INTERVAL %d second)", col, secs), nil
}

// ClickHouseMacros is the complete macro set used by the ClickHouse datasource.
// It layers ClickHouse-specific handlers on top of macropro.DefaultMacros so
// that the effective set covers both the SDK-standard names (interval,
// interval_ms, timeFilter, timeFrom, timeTo, timeGroup, table, column) and
// ClickHouse-specific extensions (fromTime, toTime, dateFilter, etc.).
//
// Where the dialect-neutral default produces output that does not parse as
// valid ClickHouse SQL — timeFilter, timeFrom, timeTo, timeGroup — the
// override below emits ClickHouse-native functions (toDateTime,
// toStartOfInterval). The remaining defaults (interval, interval_ms, table,
// column) are format-neutral and reused as-is.
var ClickHouseMacros = macropro.MergeMacros(
	macropro.DefaultMacros[struct{}](),
	macropro.MacroMap[struct{}]{
		// Overrides of SDK defaults with ClickHouse-correct SQL.
		"timeFilter": TimeFilter,
		"timeFrom":   TimeFrom,
		"timeTo":     TimeTo,
		"timeGroup":  TimeGroup,

		// ClickHouse-specific extensions (no SDK-default equivalent).
		"fromTime":        FromTimeFilter,
		"toTime":          ToTimeFilter,
		"fromTime_ms":     FromTimeFilterMs,
		"toTime_ms":       ToTimeFilterMs,
		"timeFilter_ms":   TimeFilterMs,
		"dateFilter":      DateFilter,
		"dateTimeFilter":  DateTimeFilter,
		"dt":              DateTimeFilter,
		"timeInterval":    TimeInterval,
		"timeInterval_ms": TimeIntervalMs,
		"interval_s":      IntervalSeconds,
	},
)

// Interpolate expands all $__ macros in rawSQL using macropro's parsing engine.
// Unknown macros are left unchanged; a handler error returns the original query and the error.
func Interpolate(rawSQL string, q *sqlutil.Query) (string, error) {
	return macropro.Interpolate(rawSQL, ClickHouseMacros, contextFrom(q))
}

// RemoveQuotesInArgs removes all quotes from macro arguments.
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

// IsValidComparisonPredicates checks whether s is a valid SQL comparison operator.
func IsValidComparisonPredicates(comparison_predicates string) bool {
	switch comparison_predicates {
	case "=", "!=", "<>", "<", "<=", ">", ">=":
		return true
	}
	return false
}