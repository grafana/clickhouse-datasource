package macros_test

import (
	"testing"
	"time"

	"github.com/grafana/clickhouse-datasource/pkg/macros"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/sqlds"
	"github.com/stretchr/testify/assert"
)

func TestMacroFromTimeFilter(t *testing.T) {
	from, _ := time.Parse("2006-01-02T15:04:05.000Z", "2014-11-12T11:45:26.371Z")
	to, _ := time.Parse("2006-01-02T15:04:05.000Z", "2015-11-12T11:45:26.371Z")
	query := sqlds.Query{
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
			name: "should return timefilter",
			want: "toDateTime(intDiv(1415792726371,1000))",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := macros.FromTimeFilter(&query, []string{})
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
	query := sqlds.Query{
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
			name: "should return timefilter",
			want: "toDateTime(intDiv(1447328726371,1000))",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := macros.ToTimeFilter(&query, []string{})
			if (err != nil) != tt.wantErr {
				t.Errorf("macroToTimeFilter() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMacroTimeInterval(t *testing.T) {
	query := sqlds.Query{
		RawSQL:   "select $__timeInterval(col) from foo",
		Interval: time.Duration(20000000000),
	}
	got, err := macros.TimeInterval(&query, []string{"col"})
	assert.Nil(t, err)
	assert.Equal(t, "toStartOfInterval(col, INTERVAL 20 second)", got)
}

func TestMacroIntervalSeconds(t *testing.T) {
	query := sqlds.Query{
		RawSQL:   "select toStartOfInterval(col, INTERVAL $__interval_s second) AS time from foo",
		Interval: time.Duration(20000000000),
	}
	got, err := macros.IntervalSeconds(&query, []string{})
	assert.Nil(t, err)
	assert.Equal(t, "20", got)
}
