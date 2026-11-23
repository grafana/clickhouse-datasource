package plugin

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// ClickHouse exception codes for a name that doesn't exist.
const (
	exceptionCodeUnknownTable    int32 = 60 // UNKNOWN_TABLE
	exceptionCodeUnknownDatabase int32 = 81 // UNKNOWN_DATABASE
)

// httpException matches the server's exception in an error of the HTTP transport, which carries
// the response body: "Code: 60. DB::Exception: Table a.b does not exist. (UNKNOWN_TABLE) (version ...)".
var httpException = regexp.MustCompile(`Code: (\d+)\. DB::Exception: (.*?)\.? \([A-Z_]+\)`)

// checkSingleSourceTable runs in the health check after the connection check. A Single source
// data source reads one table, so a database or table that doesn't exist fails every query while
// the connection check passes. Only those two errors fail the health check: with Forward OAuth
// Identity the configured user may only be used for health checks and have no access to the
// table, so other errors, such as missing privileges, are left to the queries.
func checkSingleSourceTable(ctx context.Context, db *sql.DB, source *SourceTable) *backend.CheckHealthResult {
	if db == nil || source == nil {
		return nil
	}

	err := describeTable(ctx, db, source)
	if err == nil {
		return nil
	}
	code, message := clickHouseException(err)
	if code != exceptionCodeUnknownTable && code != exceptionCodeUnknownDatabase {
		backend.Logger.Debug("could not check the table of the data source", "table", source.Database+"."+source.Table, "error", err)
		return nil
	}
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusError,
		Message: fmt.Sprintf("[%s] %s", ConnectionErrorCategoryTable, message),
	}
}

func describeTable(ctx context.Context, db *sql.DB, source *SourceTable) error {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("DESCRIBE TABLE %s.%s", quoteIdentifier(source.Database), quoteIdentifier(source.Table)))
	if err != nil {
		return err
	}
	defer rows.Close() //nolint:errcheck
	// A table has at least one column, so a first row means it exists. Without one, Err holds
	// the exception if the server sent it after the query started.
	if rows.Next() {
		return nil
	}
	return rows.Err()
}

// clickHouseException returns the code and message of the server exception behind err, from
// the exception of the native protocol or the response body of the HTTP protocol. The code is 0
// and the message is the error text when err carries no exception.
func clickHouseException(err error) (int32, string) {
	var exception *clickhouse.Exception
	if errors.As(err, &exception) {
		return exception.Code, exception.Message
	}
	if match := httpException.FindStringSubmatch(err.Error()); match != nil {
		code, parseErr := strconv.ParseInt(match[1], 10, 32)
		if parseErr == nil {
			return int32(code), match[2]
		}
	}
	return 0, err.Error()
}

// quoteIdentifier quotes a database or table name for a query, escaping backslashes and backticks.
func quoteIdentifier(name string) string {
	return "`" + strings.NewReplacer(`\`, `\\`, "`", "\\`").Replace(name) + "`"
}
