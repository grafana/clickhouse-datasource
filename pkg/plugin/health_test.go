package plugin

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/stretchr/testify/assert"
)

// cspell:ignore otle
func TestClickHouseException(t *testing.T) {
	tests := []struct {
		name        string
		err         error
		wantCode    int32
		wantMessage string
	}{
		{
			name:        "native protocol exception",
			err:         &clickhouse.Exception{Code: 60, Name: "DB::Exception", Message: "Table otel.otel_logz does not exist. Maybe you meant otel.otel_logs?"},
			wantCode:    60,
			wantMessage: "Table otel.otel_logz does not exist. Maybe you meant otel.otel_logs?",
		},
		{
			name:        "wrapped native protocol exception",
			err:         fmt.Errorf("query: %w", &clickhouse.Exception{Code: 81, Message: "Database otle does not exist. Maybe you meant otel?"}),
			wantCode:    81,
			wantMessage: "Database otle does not exist. Maybe you meant otel?",
		},
		{
			name:        "HTTP protocol response body",
			err:         errors.New(`sendQuery: [HTTP 404] response body: "Code: 60. DB::Exception: Table otel.otel_logz does not exist. Maybe you meant otel.otel_logs?. (UNKNOWN_TABLE) (version 26.10.3.7 (official build))` + "\n\""),
			wantCode:    60,
			wantMessage: "Table otel.otel_logz does not exist. Maybe you meant otel.otel_logs?",
		},
		{
			name:        "HTTP protocol response body without a hint",
			err:         errors.New(`[HTTP 404] response body: "Code: 81. DB::Exception: Database otle does not exist. (UNKNOWN_DATABASE) (version 26.3.2.3 (official build))"`),
			wantCode:    81,
			wantMessage: "Database otle does not exist",
		},
		{
			name:        "error without an exception",
			err:         errors.New("connection reset by peer"),
			wantCode:    0,
			wantMessage: "connection reset by peer",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, message := clickHouseException(tt.err)
			assert.Equal(t, tt.wantCode, code)
			assert.Equal(t, tt.wantMessage, message)
		})
	}
}

func TestQuoteIdentifier(t *testing.T) {
	assert.Equal(t, "`otel_logs`", quoteIdentifier("otel_logs"))
	assert.Equal(t, "`my db`", quoteIdentifier("my db"))
	assert.Equal(t, "`a\\`b`", quoteIdentifier("a`b"))
	assert.Equal(t, "`a\\\\b`", quoteIdentifier(`a\b`))
}

func TestCheckSingleSourceTableWithoutTable(t *testing.T) {
	assert.Nil(t, checkSingleSourceTable(context.Background(), nil, &SourceTable{Signal: "logs", Database: "otel", Table: "otel_logs"}))
	assert.Nil(t, checkSingleSourceTable(context.Background(), nil, nil))
}
