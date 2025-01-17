package macros

import (
	"fmt"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type ClickhouseDriver struct {
	sqlds.Driver
}

type MockDB struct {
	ClickhouseDriver
}

func (h *ClickhouseDriver) Macros() sqlds.Macros {
	return Macros
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
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
		RawSQL: "select foo from foo where bar > $__fromTime",
	}
	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{
			name: "should return timeFilter",
			want: "toDateTime(1415792726)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FromTimeFilter(&query, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("macroFromTimeFilter() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroToTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
		RawSQL: "select foo from foo where bar > $__toTime",
	}
	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{
			name: "should return timeFilter",
			want: "toDateTime(1447328726)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToTimeFilter(&query, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("macroToTimeFilter() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroFromTimeFilterMs(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
		RawSQL: "select foo from foo where bar > $__fromTime",
	}
	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{
			name: "should return timeFilter_ms",
			want: "fromUnixTimestamp64Milli(1415792726371)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FromTimeFilterMs(&query, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("macroFromTimeFilterMs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroToTimeFilterMs(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
		RawSQL: "select foo from foo where bar > $__toTime",
	}
	tests := []struct {
		want    string
		wantErr bool
		name    string
	}{
		{
			name: "should return timeFilter_ms",
			want: "fromUnixTimestamp64Milli(1447328726371)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToTimeFilterMs(&query, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("macroToTimeFilterMs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroDateFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
	}
	got, err := DateFilter(&query, []string{"dateCol"})
	assert.Nil(t, err)
	assert.Equal(t, "dateCol >= toDate('2014-11-12') AND dateCol <= toDate('2015-11-12')", got)
}

func TestMacroDateTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlutil.Query{
		TimeRange: backend.TimeRange{
			From: from,
			To:   to,
		},
	}
	got, err := DateTimeFilter(&query, []string{"dateCol", "timeCol"})
	assert.Nil(t, err)
	assert.Equal(t, "(dateCol >= toDate('2014-11-12') AND dateCol <= toDate('2015-11-12')) AND (timeCol >= toDateTime(1415792726) AND timeCol <= toDateTime(1447328726))", got)
}

func TestMacroTimeInterval(t *testing.T) {
	query := sqlutil.Query{
		RawSQL:   "select $__timeInterval(col) from foo",
		Interval: time.Duration(20000000000),
	}
	got, err := TimeInterval(&query, []string{"col"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime(col), INTERVAL 20 second)", got)
}

func TestMacroTimeIntervalMs(t *testing.T) {
	query := sqlutil.Query{
		RawSQL:   "select $__timeInterval_ms(col) from foo",
		Interval: time.Duration(20000000000),
	}
	got, err := TimeIntervalMs(&query, []string{"col"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(toDateTime64(col, 3), INTERVAL 20000 millisecond)", got)
}

func TestMacroIntervalSeconds(t *testing.T) {
	query := sqlutil.Query{
		RawSQL:   "select toStartOfInterval(col, INTERVAL $__interval_s second) AS time from foo",
		Interval: time.Duration(20000000000),
	}
	got, err := IntervalSeconds(&query, []string{})
	assert.Nil(t, err)
	assert.Equal(t, "20", got)
}

// test sqlds query interpolation with clickhouse filters used
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
		driver := MockDB{}
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
			interpolatedQuery, err := sqlds.Interpolate(&driver, query)
			require.Nil(t, err)
			assert.Equal(t, tc.output, interpolatedQuery)
		})
	}
}
