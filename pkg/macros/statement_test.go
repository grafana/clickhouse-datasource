package macros

import (
	stdErrors "errors"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stmtQuery builds a sqlutil.Query with a fixed time range and interval so
// that expansions have stable golden strings: from=1415792726, to=1447328726,
// interval=20s.
func stmtQuery(raw string) *sqlutil.Query {
	return &sqlutil.Query{
		RawSQL: raw,
		TimeRange: backend.TimeRange{
			From: time.Unix(1415792726, 0).UTC(),
			To:   time.Unix(1447328726, 0).UTC(),
		},
		Interval: 20 * time.Second,
	}
}

func TestExpandStatementMacrosColumns(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "basic",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "merges user WHERE with generated time filter",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests WHERE ServiceName != ''",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) AND (ServiceName != '') GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "key alias overrides default metric alias",
			input: "$__columns(EventTime, ServiceName AS svc, count()) FROM requests",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS svc, count() AS value FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, svc ORDER BY t, svc",
		},
		{
			name:  "value without alias defaults to value",
			input: "$__columns(EventTime, ServiceName, count()) FROM requests",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS value FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "user ORDER BY replaces the default",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests ORDER BY t DESC",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t DESC",
		},
		{
			name:  "HAVING is kept after the generated GROUP BY",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests HAVING c > 10",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric HAVING c > 10 ORDER BY t, metric",
		},
		{
			name:  "LIMIT and SETTINGS are kept at the end",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests LIMIT 100 SETTINGS max_threads = 4",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t, metric LIMIT 100 SETTINGS max_threads = 4",
		},
		{
			name:  "PREWHERE stays attached to the FROM segment",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests PREWHERE Region = 'eu'",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests PREWHERE Region = 'eu' WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "text before the macro is preserved",
			input: "WITH top AS (SELECT ServiceName FROM requests GROUP BY ServiceName ORDER BY count() DESC LIMIT 5) $__columns(EventTime, ServiceName, count() AS c) FROM requests WHERE ServiceName IN top",
			want:  "WITH top AS (SELECT ServiceName FROM requests GROUP BY ServiceName ORDER BY count() DESC LIMIT 5) SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) AND (ServiceName IN top) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "trailing semicolon is dropped",
			input: "$__columns(EventTime, ServiceName, count() AS c) FROM requests;",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "keywords are matched case-insensitively",
			input: "$__columns(EventTime, ServiceName, count() AS c) from requests where ServiceName != '' limit 10",
			want:  "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, count() AS c from requests WHERE $__timeFilter(EventTime) AND (ServiceName != '') GROUP BY t, metric ORDER BY t, metric limit 10",
		},
		{
			name:  "backtick identifier containing a comma is one argument",
			input: "$__columns(timestamp, `service,name`, count()) FROM events",
			want:  "SELECT $__timeInterval(timestamp) AS t, toString(`service,name`) AS metric, count() AS value FROM events WHERE $__timeFilter(timestamp) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "keyword inside a backtick identifier is not a clause boundary",
			input: "$__columns(ts, svc, count()) FROM `weird where table` WHERE x = 1",
			want:  "SELECT $__timeInterval(ts) AS t, toString(svc) AS metric, count() AS value FROM `weird where table` WHERE $__timeFilter(ts) AND (x = 1) GROUP BY t, metric ORDER BY t, metric",
		},
		{
			name:  "AS inside a backtick identifier is not an alias",
			input: "$__columns(ts, `a AS b`, count()) FROM events",
			want:  "SELECT $__timeInterval(ts) AS t, toString(`a AS b`) AS metric, count() AS value FROM events WHERE $__timeFilter(ts) GROUP BY t, metric ORDER BY t, metric",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExpandStatementMacrosColumnsErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		errText string
	}{
		{
			name:    "wrong argument count",
			input:   "$__columns(EventTime, ServiceName) FROM requests",
			errText: "expected 3 argument(s)",
		},
		{
			name:    "missing FROM clause",
			input:   "$__columns(EventTime, ServiceName, count() AS c)",
			errText: "FROM",
		},
		{
			name:    "user GROUP BY is rejected",
			input:   "$__columns(EventTime, ServiceName, count() AS c) FROM requests GROUP BY ServiceName",
			errText: "GROUP BY",
		},
		{
			name:    "misordered clauses are rejected",
			input:   "$__columns(EventTime, ServiceName, count() AS c) FROM requests ORDER BY t HAVING c > 1",
			errText: "HAVING",
		},
		{
			name:    "missing parentheses",
			input:   "$__columns FROM requests",
			errText: "argument",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.errText)
			var src backend.ErrorWithSource
			require.True(t, stdErrors.As(err, &src), "error should carry a source")
			assert.Equal(t, backend.ErrorSourceDownstream, src.ErrorSource())
		})
	}
}

func TestExpandStatementMacrosRateColumns(t *testing.T) {
	input := "$__rateColumns(EventTime, ServiceName, sum(Requests)) FROM requests"
	want := "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, " +
		"if((t - lagInFrame(t, 1, t) OVER w) = 0, nan, sum(Requests) / (t - lagInFrame(t, 1, t) OVER w)) AS value " +
		"FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric " +
		"WINDOW w AS (PARTITION BY metric ORDER BY t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) " +
		"ORDER BY t, metric"

	got, err := expandStatementMacros(input, stmtQuery(input))
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

func TestExpandStatementMacrosPerSecondColumns(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "basic",
			input: "$__perSecondColumns(EventTime, ServiceName, Requests) FROM requests",
			want: "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, " +
				"if((t - lagInFrame(t, 1, t) OVER w) = 0 OR (max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w) < 0, nan, " +
				"(max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w) / (t - lagInFrame(t, 1, t) OVER w)) AS value " +
				"FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric " +
				"WINDOW w AS (PARTITION BY metric ORDER BY t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) " +
				"ORDER BY t, metric",
		},
		{
			name:  "value alias is applied after the counter is wrapped in max()",
			input: "$__perSecondColumns(EventTime, ServiceName, Requests AS rps) FROM requests",
			want: "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, " +
				"if((t - lagInFrame(t, 1, t) OVER w) = 0 OR (max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w) < 0, nan, " +
				"(max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w) / (t - lagInFrame(t, 1, t) OVER w)) AS rps " +
				"FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric " +
				"WINDOW w AS (PARTITION BY metric ORDER BY t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) " +
				"ORDER BY t, metric",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExpandStatementMacrosIncreaseColumns(t *testing.T) {
	input := "$__increaseColumns(EventTime, ServiceName, Requests) FROM requests"
	want := "SELECT $__timeInterval(EventTime) AS t, toString(ServiceName) AS metric, " +
		"if((t - lagInFrame(t, 1, t) OVER w) = 0 OR (max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w) < 0, nan, " +
		"toFloat64(max(Requests) - lagInFrame(max(Requests), 1, max(Requests)) OVER w)) AS value " +
		"FROM requests WHERE $__timeFilter(EventTime) GROUP BY t, metric " +
		"WINDOW w AS (PARTITION BY metric ORDER BY t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) " +
		"ORDER BY t, metric"

	got, err := expandStatementMacros(input, stmtQuery(input))
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

func TestExpandStatementMacrosLTTB(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "basic with user WHERE",
			input: "$__lttb(1000, EventTime, Latency) FROM latencies WHERE Region = 'eu'",
			want: "SELECT point.1 AS EventTime, point.2 AS Latency FROM " +
				"(SELECT arrayJoin(lttb(1000)(EventTime, Latency)) AS point FROM latencies " +
				"WHERE $__timeFilter(EventTime) AND (Region = 'eu')) ORDER BY EventTime",
		},
		{
			name:  "auto buckets derive from the panel time range and interval",
			input: "$__lttb(auto, EventTime, Latency) FROM latencies",
			want: "SELECT point.1 AS EventTime, point.2 AS Latency FROM " +
				"(SELECT arrayJoin(lttb(1576800)(EventTime, Latency)) AS point FROM latencies " +
				"WHERE $__timeFilter(EventTime)) ORDER BY EventTime",
		},
		{
			name:  "GROUP BY pre-aggregates in a subquery so lttb never nests aggregates",
			input: "$__lttb(5, ts, avg(value)) FROM events GROUP BY ts",
			want: "SELECT point.1 AS ts, point.2 AS y FROM " +
				"(SELECT arrayJoin(lttb(5)(ts, y)) AS point FROM " +
				"(SELECT ts, avg(value) AS y FROM events WHERE $__timeFilter(ts) GROUP BY ts ORDER BY ts)) ORDER BY ts",
		},
		{
			name:  "aliases steer the pre-aggregated columns",
			input: "$__lttb(500, EventTime, avg(Latency) AS l) FROM latencies GROUP BY EventTime",
			want: "SELECT point.1 AS EventTime, point.2 AS l FROM " +
				"(SELECT arrayJoin(lttb(500)(EventTime, l)) AS point FROM " +
				"(SELECT EventTime, avg(Latency) AS l FROM latencies " +
				"WHERE $__timeFilter(EventTime) GROUP BY EventTime ORDER BY EventTime)) ORDER BY EventTime",
		},
		{
			name:  "non-identifier expressions fall back to x and y aliases",
			input: "$__lttb(100, toUnixTimestamp(EventTime), Latency / 2) FROM latencies",
			want: "SELECT point.1 AS x, point.2 AS y FROM " +
				"(SELECT arrayJoin(lttb(100)(toUnixTimestamp(EventTime), Latency / 2)) AS point FROM latencies " +
				"WHERE $__timeFilter(toUnixTimestamp(EventTime))) ORDER BY x",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestExpandStatementMacrosLTTBErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		errText string
	}{
		{
			name:    "buckets must be an integer or auto",
			input:   "$__lttb(ten, EventTime, Latency) FROM latencies",
			errText: "buckets",
		},
		{
			name:    "wrong argument count",
			input:   "$__lttb(1000, EventTime) FROM latencies",
			errText: "expected 3 argument(s)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.errText)
		})
	}
}

func TestExpandStatementMacrosPassthrough(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{
			name:  "query without statement macros is returned unchanged",
			input: "SELECT count() FROM requests WHERE $__timeFilter(EventTime)",
		},
		{
			name:  "statement macro inside a string literal is ignored",
			input: "SELECT '$__columns(a, b, c)' FROM requests",
		},
		{
			name:  "statement macro inside a line comment is ignored",
			input: "-- $__columns(a, b, c)\nSELECT 1 FROM requests",
		},
		{
			name:  "statement macro inside a block comment is ignored",
			input: "/* $__lttb(10, a, b) */ SELECT 1 FROM requests",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.NoError(t, err)
			assert.Equal(t, tt.input, got)
		})
	}
}

func TestExpandStatementMacrosPlacementErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		errText string
	}{
		{
			name:    "statement macro inside a subquery is rejected",
			input:   "SELECT * FROM ($__columns(EventTime, ServiceName, count() AS c) FROM requests)",
			errText: "top level",
		},
		{
			name:    "multiple statement macros are rejected",
			input:   "$__columns(a, b, count() AS c) FROM t UNION ALL $__columns(a, b, count() AS c) FROM t",
			errText: "one statement macro",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := expandStatementMacros(tt.input, stmtQuery(tt.input))
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.errText)
		})
	}
}

// TestInterpolateStatementMacros verifies the full pipeline: the statement
// pre-pass emits $__timeInterval / $__timeFilter calls which macropro then
// expands with the query's real time range and interval.
func TestInterpolateStatementMacros(t *testing.T) {
	input := "$__columns(EventTime, ServiceName, count() AS c) FROM requests"
	q := stmtQuery(input)

	got, err := Interpolate(input, q)
	require.NoError(t, err)

	want := "SELECT toStartOfInterval(toDateTime(EventTime), INTERVAL 20 second) AS t, " +
		"toString(ServiceName) AS metric, count() AS c FROM requests " +
		"WHERE EventTime >= toDateTime(1415792726) AND EventTime <= toDateTime(1447328726) " +
		"GROUP BY t, metric ORDER BY t, metric"
	assert.Equal(t, want, got)
}

// TestInterpolateBacktickIdentifierWithCommentMarker verifies that comment
// markers inside backtick-quoted identifiers survive the whole pipeline:
// without BacktickQuote in the comment style, StripComments would blank the
// identifier from the -- onwards.
func TestInterpolateBacktickIdentifierWithCommentMarker(t *testing.T) {
	input := "$__columns(ts, `svc--name`, count()) FROM events"
	q := stmtQuery(input)

	got, err := Interpolate(input, q)
	require.NoError(t, err)

	want := "SELECT toStartOfInterval(toDateTime(ts), INTERVAL 20 second) AS t, " +
		"toString(`svc--name`) AS metric, count() AS value FROM events " +
		"WHERE ts >= toDateTime(1415792726) AND ts <= toDateTime(1447328726) " +
		"GROUP BY t, metric ORDER BY t, metric"
	assert.Equal(t, want, got)
}

// TestInterpolateStatementMacroError verifies that a statement macro error
// surfaces from Interpolate with the original query returned unchanged.
func TestInterpolateStatementMacroError(t *testing.T) {
	input := "$__columns(EventTime) FROM requests"
	q := stmtQuery(input)

	got, err := Interpolate(input, q)
	require.Error(t, err)
	assert.Equal(t, input, got)
}
