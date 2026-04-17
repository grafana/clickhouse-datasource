package macros

import (
	"fmt"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/macropro"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makeCtx is a test helper that builds a macropro.QueryContext from time range and interval.
func makeCtx(from, to time.Time, interval time.Duration) macropro.QueryContext[struct{}] {
	return macropro.QueryContext[struct{}]{
		TimeRange: macropro.TimeRange{From: from, To: to},
		Interval:  interval,
		IntervalMS: interval.Milliseconds(),
	}
}

func TestTimeToDate(t *testing.T) {
	d, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")

	expected := "toDate('2014-11-12')"
	result := timeToDate(d)

	if expected != result {
		t.Errorf("unexpected output. expected: %s got: %s", expected, result)
	}
}

func TestTimeToDateTime(t *testing.T) {
	dt := time.Unix(1708430068, 0)

	expected := "toDateTime(1708430068)"
	result := timeToDateTime(dt)

	if expected != result {
		t.Errorf("unexpected output. expected: %s got: %s", expected, result)
	}
}

func TestTimeToDateTime64(t *testing.T) {
	dt := time.UnixMilli(1708430068123)

	expected := "fromUnixTimestamp64Milli(1708430068123)"
	result := timeToDateTime64(dt)

	if expected != result {
		t.Errorf("unexpected output. expected: %s got: %s", expected, result)
	}
}

func TestMacroFromTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{name: "should return timeFilter", want: "toDateTime(1415792726)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FromTimeFilter(ctx, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("FromTimeFilter() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroToTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{name: "should return timeFilter", want: "toDateTime(1447328726)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToTimeFilter(ctx, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("ToTimeFilter() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroFromTimeFilterMs(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{name: "should return timeFilter_ms", want: "fromUnixTimestamp64Milli(1415792726371)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FromTimeFilterMs(ctx, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("FromTimeFilterMs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroToTimeFilterMs(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{name: "should return timeFilter_ms", want: "fromUnixTimestamp64Milli(1447328726371)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToTimeFilterMs(ctx, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("ToTimeFilterMs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroDateFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	got, err := DateFilter(ctx, []string{"dateCol"})
	assert.Nil(t, err)
	assert.Equal(t, "dateCol >= toDate('2014-11-12') AND dateCol <= toDate('2015-11-12')", got)
}

func TestMacroDateTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	got, err := DateTimeFilter(ctx, []string{"dateCol", "timeCol"})
	assert.Nil(t, err)
	assert.Equal(t, "(dateCol >= toDate('2014-11-12') AND dateCol <= toDate('2015-11-12')) AND (timeCol >= toDateTime(1415792726) AND timeCol <= toDateTime(1447328726))", got)
}

func TestMacroTimeInterval(t *testing.T) {
	ctx := makeCtx(time.Time{}, time.Time{}, time.Duration(20000000000))
	got, err := TimeInterval(ctx, []string{"col"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime(col), INTERVAL 20 second)", got)
}

func TestMacroTimeIntervalMs(t *testing.T) {
	ctx := makeCtx(time.Time{}, time.Time{}, time.Duration(20000000000))
	got, err := TimeIntervalMs(ctx, []string{"col"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime64(col, 3), INTERVAL 20000 millisecond)", got)
}

func TestMacroIntervalSeconds(t *testing.T) {
	ctx := makeCtx(time.Time{}, time.Time{}, time.Duration(20000000000))
	got, err := IntervalSeconds(ctx, []string{})
	assert.Nil(t, err)
	assert.Equal(t, "20", got)
}

func TestMacroTimeFrom(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	got, err := TimeFrom(ctx, []string{"ts"})
	assert.Nil(t, err)
	assert.Equal(t, "ts >= toDateTime(1415792726)", got)

	_, err = TimeFrom(ctx, []string{})
	assert.Error(t, err)
}

func TestMacroTimeTo(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	ctx := makeCtx(from, to, 0)

	got, err := TimeTo(ctx, []string{"ts"})
	assert.Nil(t, err)
	assert.Equal(t, "ts <= toDateTime(1447328726)", got)

	_, err = TimeTo(ctx, []string{})
	assert.Error(t, err)
}

func TestMacroTimeGroup(t *testing.T) {
	ctx := makeCtx(time.Time{}, time.Time{}, 0)

	got, err := TimeGroup(ctx, []string{"ts", "5m"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime(ts), INTERVAL 300 second)", got)

	got, err = TimeGroup(ctx, []string{"ts", "1h"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime(ts), INTERVAL 3600 second)", got)

	_, err = TimeGroup(ctx, []string{"ts"})
	assert.Error(t, err)

	_, err = TimeGroup(ctx, []string{"ts", "not-a-duration"})
	assert.Error(t, err)
}

// TestInterpolate verifies end-to-end macro expansion using macropro.Interpolate directly,
// without going through sqlds. The mock driver is no longer required.
func TestInterpolate(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.123Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.456Z")

	tableName := "my_table"
	tableColumn := "my_col"

	type test struct {
		name   string
		input  string
		output string
	}

	tests := []test{
		{input: "select * from foo where $__timeFilter(cast(sth as timestamp))", output: "select * from foo where cast(sth as timestamp) >= toDateTime(1415792726) AND cast(sth as timestamp) <= toDateTime(1447328726)", name: "clickhouse timeFilter"},
		{input: "select * from foo where $__timeFilter(cast(sth as timestamp) )", output: "select * from foo where cast(sth as timestamp) >= toDateTime(1415792726) AND cast(sth as timestamp) <= toDateTime(1447328726)", name: "clickhouse timeFilter with empty spaces"},
		{input: "select * from foo where $__timeFilter_ms(cast(sth as timestamp))", output: "select * from foo where cast(sth as timestamp) >= fromUnixTimestamp64Milli(1415792726123) AND cast(sth as timestamp) <= fromUnixTimestamp64Milli(1447328726456)", name: "clickhouse timeFilter_ms"},
		{input: "select * from foo where $__timeFilter_ms(cast(sth as timestamp) )", output: "select * from foo where cast(sth as timestamp) >= fromUnixTimestamp64Milli(1415792726123) AND cast(sth as timestamp) <= fromUnixTimestamp64Milli(1447328726456)", name: "clickhouse timeFilter_ms with empty spaces"},
		{input: "select * from foo where ( date >= $__fromTime and date <= $__toTime ) limit 100", output: "select * from foo where ( date >= toDateTime(1415792726) and date <= toDateTime(1447328726) ) limit 100", name: "clickhouse fromTime and toTime"},
		{input: "select * from foo where ( date >= $__fromTime ) and ( date <= $__toTime ) limit 100", output: "select * from foo where ( date >= toDateTime(1415792726) ) and ( date <= toDateTime(1447328726) ) limit 100", name: "clickhouse fromTime and toTime inside a complex clauses"},
		{input: "select * from foo where ( date >= $__fromTime_ms and date <= $__toTime_ms ) limit 100", output: "select * from foo where ( date >= fromUnixTimestamp64Milli(1415792726123) and date <= fromUnixTimestamp64Milli(1447328726456) ) limit 100", name: "clickhouse fromTime_ms and toTime_ms"},
		{input: "select * from foo where ( date >= $__fromTime_ms ) and ( date <= $__toTime_ms ) limit 100", output: "select * from foo where ( date >= fromUnixTimestamp64Milli(1415792726123) ) and ( date <= fromUnixTimestamp64Milli(1447328726456) ) limit 100", name: "clickhouse fromTime_ms and toTime_ms inside a complex clauses"},
	}

	for i, tc := range tests {
		t.Run(fmt.Sprintf("[%d/%d] %s", i+1, len(tests), tc.name), func(t *testing.T) {
			query := &sqlutil.Query{
				RawSQL: tc.input,
				Table:  tableName,
				Column: tableColumn,
				TimeRange: backend.TimeRange{
					From: from,
					To:   to,
				},
			}
			interpolatedQuery, err := Interpolate(tc.input, query)
			require.Nil(t, err)
			assert.Equal(t, tc.output, interpolatedQuery)
		})
	}
}