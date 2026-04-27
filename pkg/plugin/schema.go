package plugin

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/grafana/clickhouse-datasource/pkg/plugin/schemacache"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	schemas "github.com/grafana/schemads"
)

var (
	numberOperators = []schemas.Operator{
		schemas.OperatorGreaterThan,
		schemas.OperatorGreaterThanOrEqual,
		schemas.OperatorLessThan,
		schemas.OperatorLessThanOrEqual,
		schemas.OperatorEquals,
		schemas.OperatorNotEquals,
		schemas.OperatorIn,
	}
	timeRangeOperators = []schemas.Operator{
		schemas.OperatorGreaterThan,
		schemas.OperatorGreaterThanOrEqual,
		schemas.OperatorLessThan,
		schemas.OperatorLessThanOrEqual,
		schemas.OperatorEquals,
		schemas.OperatorNotEquals,
	}
	equalityOperators = []schemas.Operator{
		schemas.OperatorEquals,
		schemas.OperatorIn,
		schemas.OperatorNotEquals,
	}
	stringOperators = []schemas.Operator{
		schemas.OperatorEquals,
		schemas.OperatorNotEquals,
		schemas.OperatorIn,
		schemas.OperatorLike,
	}
)

type SchemaProvider struct {
	clickhousePlugin *Clickhouse
	settings         backend.DataSourceInstanceSettings

	// The three caches below are populated from datasource settings at
	// construction time. A nil cache means caching is disabled for that
	// handler — the handler code must treat nil as "always miss, no set".
	tablesCache  *schemacache.Cache[[]string]
	columnsCache *schemacache.Cache[map[string][]schemas.Column]
	valuesCache  *schemacache.Cache[map[string][]string]
}

// Schema implements [schemas.SchemaHandler].
func (p *SchemaProvider) Schema(ctx context.Context, req *schemas.SchemaRequest) (*schemas.SchemaResponse, error) {
	tableResponse, err := p.Tables(ctx, &schemas.TablesRequest{})
	if err != nil {
		return &schemas.SchemaResponse{
			Errors: err.Error(),
		}, nil
	}

	columnsMap, err := p.cachedFetchColumns(ctx, tableResponse.Tables, nil)
	if err != nil {
		return &schemas.SchemaResponse{
			Errors: err.Error(),
		}, nil
	}

	response := &schemas.SchemaResponse{
		FullSchema: &schemas.Schema{
			Tables: make([]schemas.Table, 0),
		},
	}
	for _, table := range tableResponse.Tables {
		columns := columnsMap[table]
		response.FullSchema.Tables = append(response.FullSchema.Tables, schemas.Table{
			Name:    table,
			Columns: columns,
		})
	}
	return response, nil
}

// Tables implements [schemas.TablesHandler].
//
// Results are memoised via the per-datasource tables cache when enabled. The
// cache holds a single entry ("all") because the query is parameter-free —
// every caller gets the same list. The 60s TTL (see NewSchemaProvider) means
// a newly-created table shows up within one TTL window, which is acceptable
// for a schema picker but explicit here so future readers know the trade-off.
func (p *SchemaProvider) Tables(ctx context.Context, req *schemas.TablesRequest) (*schemas.TablesResponse, error) {
	if p.tablesCache == nil {
		tables, err := p.fetchTables(ctx)
		if err != nil {
			return &schemas.TablesResponse{Errors: map[string]string{"A": err.Error()}}, nil
		}
		return &schemas.TablesResponse{Tables: tables}, nil
	}

	tables, err := p.tablesCache.Do(ctx, "all", func(ctx context.Context) ([]string, error) {
		return p.fetchTables(ctx)
	})
	if err != nil {
		return &schemas.TablesResponse{Errors: map[string]string{"A": err.Error()}}, nil
	}
	return &schemas.TablesResponse{Tables: tables}, nil
}

// fetchTables runs the underlying system.tables query and is the function
// wrapped by the cache in [SchemaProvider.Tables]. Kept as a method so a
// singleflight-collapsed caller can reuse the same code path as a
// cache-disabled caller.
func (p *SchemaProvider) fetchTables(ctx context.Context) ([]string, error) {
	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return nil, err
	}

	rows, err := ds.QueryContext(ctx, "SELECT database, name FROM system.tables ORDER BY database, name")
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := rows.Close(); err != nil {
			backend.Logger.Error("failed to close rows", "error", err)
		}
	}()

	tables := make([]string, 0)
	for rows.Next() {
		var database, table string
		if err := rows.Scan(&database, &table); err != nil {
			return nil, err
		}
		if database == "system" {
			continue
		}
		tables = append(tables, fmt.Sprintf("%s.%s", database, table))
	}
	return tables, nil
}

// Columns implements [schemas.ColumnsHandler].
func (p *SchemaProvider) Columns(ctx context.Context, req *schemas.ColumnsRequest) (*schemas.ColumnsResponse, error) {
	columns := make(map[string][]schemas.Column)
	errors := make(map[string]string)

	tables := make([]string, 0, len(req.Tables))
	for _, table := range req.Tables {
		if table != "" {
			tables = append(tables, table)
		}
	}
	if len(tables) == 0 {
		return &schemas.ColumnsResponse{Columns: columns, Errors: errors}, nil
	}

	columnsMap, err := p.cachedFetchColumns(ctx, tables, req.Headers)
	if err != nil {
		for _, table := range tables {
			errors[table] = err.Error()
		}
		return &schemas.ColumnsResponse{Columns: columns, Errors: errors}, nil
	}

	for _, table := range tables {
		cols := columnsMap[table]
		if len(cols) > 0 {
			columns[table] = cols
		} else {
			errors[table] = "table not found or has no columns"
		}
	}

	return &schemas.ColumnsResponse{
		Columns: columns,
		Errors:  errors,
	}, nil
}

func splitTable(table string) (string, string) {
	parts := strings.Split(table, ".")
	if len(parts) == 1 {
		return "", parts[0]
	}
	return parts[0], parts[1]
}

// escapeSQLString escapes single quotes for use in SQL string literals.
func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// quoteIdentifier quotes a ClickHouse identifier with backticks.
func quoteIdentifier(s string) string {
	return "`" + strings.ReplaceAll(s, "`", "``") + "`"
}

// cachedFetchColumns wraps fetchColumnsForAllTables with a per-datasource
// cache keyed by the sorted table list. The sort is load-bearing: Grafana's
// query builder sometimes asks for the same tables in a different order
// (e.g. as the user toggles JOIN targets), and without the sort we'd cache
// each permutation separately — a high miss rate with no upside since the
// upstream query is order-independent.
//
// Headers intentionally do not participate in the key: they are per-request
// forwarded auth tokens that do not change the schema ClickHouse sees for
// the same datasource. If we ever need per-user schema filtering this
// assumption must be revisited.
func (p *SchemaProvider) cachedFetchColumns(ctx context.Context, tables []string, headers map[string]string) (map[string][]schemas.Column, error) {
	if p.columnsCache == nil {
		return p.fetchColumnsForAllTables(ctx, tables, headers)
	}
	sorted := make([]string, len(tables))
	copy(sorted, tables)
	sort.Strings(sorted)
	key := strings.Join(sorted, "|")
	return p.columnsCache.Do(ctx, key, func(ctx context.Context) (map[string][]schemas.Column, error) {
		return p.fetchColumnsForAllTables(ctx, tables, headers)
	})
}

// fetchColumnsForAllTables queries system.columns once for all tables and returns columns keyed by "database.table".
func (p *SchemaProvider) fetchColumnsForAllTables(ctx context.Context, tables []string, headers map[string]string) (map[string][]schemas.Column, error) {
	result := make(map[string][]schemas.Column)
	if len(tables) == 0 {
		return result, nil
	}

	var inClauses []string
	var tableOnlyNames []string // table names requested without database (e.g. "myTable")
	for _, table := range tables {
		if table == "" {
			continue
		}
		database, tableName := splitTable(table)
		if database != "" {
			inClauses = append(inClauses, fmt.Sprintf("('%s', '%s')", escapeSQLString(database), escapeSQLString(tableName)))
		} else {
			tableOnlyNames = append(tableOnlyNames, tableName)
		}
	}
	if len(inClauses) == 0 && len(tableOnlyNames) == 0 {
		return result, nil
	}

	var whereParts []string
	if len(inClauses) > 0 {
		whereParts = append(whereParts, fmt.Sprintf("(database, table) IN (%s)", strings.Join(inClauses, ", ")))
	}
	if len(tableOnlyNames) > 0 {
		escaped := make([]string, len(tableOnlyNames))
		for i, t := range tableOnlyNames {
			escaped[i] = fmt.Sprintf("'%s'", escapeSQLString(t))
		}
		whereParts = append(whereParts, fmt.Sprintf("(database = currentDatabase() AND table IN (%s))", strings.Join(escaped, ", ")))
	}
	rawSQL := fmt.Sprintf("SELECT database, table, name, type, comment FROM system.columns WHERE %s ORDER BY database, table, position",
		strings.Join(whereParts, " OR "))

	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return nil, err
	}

	var currentDb string
	if len(tableOnlyNames) > 0 {
		if err := ds.QueryRowContext(ctx, "SELECT currentDatabase()").Scan(&currentDb); err != nil {
			return nil, err
		}
	}

	rows, err := ds.QueryContext(ctx, rawSQL)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := rows.Close(); err != nil {
			backend.Logger.Error("failed to close rows", "error", err)
		}
	}()

	for rows.Next() {
		var database, tableName, name, chType, comment string
		if err := rows.Scan(&database, &tableName, &name, &chType, &comment); err != nil {
			return nil, err
		}
		tableKey := fmt.Sprintf("%s.%s", database, tableName)
		colType, operators := mapClickHouseTypeToSchema(chType)
		result[tableKey] = append(result[tableKey], schemas.Column{
			Name:        name,
			Type:        colType,
			Operators:   operators,
			Description: comment,
		})
	}
	// Add short-form keys for tables requested without database; remove full-form key so we only have "myTable", not "db.myTable"
	tablesSet := make(map[string]bool)
	for _, t := range tables {
		tablesSet[t] = true
	}
	for _, tableName := range tableOnlyNames {
		preferredKey := fmt.Sprintf("%s.%s", currentDb, tableName)
		if cols, ok := result[preferredKey]; ok && len(cols) > 0 {
			result[tableName] = cols
			if !tablesSet[preferredKey] {
				delete(result, preferredKey)
			}
		}
	}
	return result, nil
}

// fetchColumnsForTable runs DESCRIBE TABLE for the given table and returns schema columns.
func (p *SchemaProvider) fetchColumnsForTable(ctx context.Context, table string, headers map[string]string) ([]schemas.Column, error) {
	database, table := splitTable(table)
	rawSQL := fmt.Sprintf("DESCRIBE TABLE \"%s\".\"%s\"", database, table)
	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return nil, err
	}
	rows, err := ds.QueryContext(ctx, rawSQL)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := rows.Close(); err != nil {
			backend.Logger.Error("failed to close rows", "error", err)
		}
	}()
	cols := make([]schemas.Column, 0)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name string
		var chType string
		var defaultType string
		var defaultExpr string
		var comment string
		var codec_expr string
		var ttl_expr string
		err := rows.Scan(&name, &chType, &defaultType, &defaultExpr, &comment, &codec_expr, &ttl_expr)
		if err != nil {
			return nil, err
		}
		colType, operators := mapClickHouseTypeToSchema(chType)
		cols = append(cols, schemas.Column{
			Name:        name,
			Type:        colType,
			Operators:   operators,
			Description: comment,
		})
	}
	return cols, nil
}

// mapClickHouseTypeToSchema maps ClickHouse types to schemads ColumnType.
func mapClickHouseTypeToSchema(chType string) (schemas.ColumnType, []schemas.Operator) {
	trimmed := strings.TrimSpace(chType)
	var baseType, innerType string
	if idx := strings.Index(trimmed, "("); idx >= 0 {
		baseType = strings.ToLower(trimmed[:idx])
		// Extract the inner argument (everything between the first "(" and last ")")
		inner := trimmed[idx+1:]
		if strings.HasSuffix(inner, ")") {
			innerType = inner[:len(inner)-1]
		} else {
			innerType = inner
		}
	} else {
		baseType = strings.ToLower(trimmed)
	}

	switch baseType {
	case "int8":
		return schemas.ColumnTypeInt8, numberOperators
	case "int16":
		return schemas.ColumnTypeInt16, numberOperators
	case "int32":
		return schemas.ColumnTypeInt32, numberOperators
	case "int64":
		return schemas.ColumnTypeInt64, numberOperators
	case "uint8":
		return schemas.ColumnTypeUint8, numberOperators
	case "uint16":
		return schemas.ColumnTypeUint16, numberOperators
	case "uint32", "ipv4":
		return schemas.ColumnTypeUint32, numberOperators
	case "uint64":
		return schemas.ColumnTypeUint64, numberOperators
	case "float32":
		return schemas.ColumnTypeFloat32, numberOperators
	case "float64", "int128", "int256", "uint128", "uint256":
		return schemas.ColumnTypeFloat64, numberOperators
	case "bool":
		return schemas.ColumnTypeBoolean, equalityOperators
	case "date", "date32":
		return schemas.ColumnTypeDate, timeRangeOperators
	case "datetime", "datetime64":
		return schemas.ColumnTypeDatetime, timeRangeOperators
	case "timestamp":
		return schemas.ColumnTypeTimestamp, timeRangeOperators
	case "string", "fixedstring":
		return schemas.ColumnTypeString, stringOperators
	case "ipv6", "uuid":
		return schemas.ColumnTypeString, equalityOperators
	case "decimal", "decimal32", "decimal64", "decimal128", "decimal256":
		return schemas.ColumnTypeDecimal, numberOperators
	case "enum", "enum8", "enum16":
		return schemas.ColumnTypeEnum, numberOperators
	case "json", "dynamic", "array", "map", "tuple", "variant", "nested":
		return schemas.ColumnTypeJSON, equalityOperators
	case "nullable", "lowcardinality":
		// Nullable(X) and LowCardinality(X) are wrappers; the logical type is the inner type
		if innerType != "" {
			return mapClickHouseTypeToSchema(innerType)
		}
	default:
		backend.Logger.Error("mapClickHouseTypeToSchema", "unknown type", chType)
	}
	return schemas.ColumnTypeJSON, equalityOperators
}

// ColumnValues implements [schemas.ColumnValuesHandler].
//
// Caching rationale: the response is DISTINCT user data from the target
// table, so a short TTL (60s) trades at most one TTL-window of staleness
// for filter dropdowns against what is typically the heaviest of the three
// schema queries (a DISTINCT scan of potentially many columns). If the user
// wants fresh values they hit "refresh". The cache is keyed on
// (table, sorted columns) so a caller asking for columns A,B gets the same
// entry as one asking for B,A.
func (p *SchemaProvider) ColumnValues(ctx context.Context, req *schemas.ColumnValuesRequest) (*schemas.ColumnValuesResponse, error) {
	if p.valuesCache == nil {
		values, err := p.fetchColumnValues(ctx, req.Table, req.Columns)
		if err != nil {
			return &schemas.ColumnValuesResponse{Errors: map[string]string{req.Table: err.Error()}}, nil
		}
		return &schemas.ColumnValuesResponse{ColumnValues: values}, nil
	}

	sortedCols := make([]string, len(req.Columns))
	copy(sortedCols, req.Columns)
	sort.Strings(sortedCols)
	key := req.Table + "::" + strings.Join(sortedCols, "|")

	values, err := p.valuesCache.Do(ctx, key, func(ctx context.Context) (map[string][]string, error) {
		return p.fetchColumnValues(ctx, req.Table, req.Columns)
	})
	if err != nil {
		return &schemas.ColumnValuesResponse{Errors: map[string]string{req.Table: err.Error()}}, nil
	}
	return &schemas.ColumnValuesResponse{ColumnValues: values}, nil
}

// fetchColumnValues runs the DISTINCT-per-column UNION ALL probe. It is the
// function wrapped by the cache in [SchemaProvider.ColumnValues].
func (p *SchemaProvider) fetchColumnValues(ctx context.Context, table string, requestedColumns []string) (map[string][]string, error) {
	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := ds.Close(); err != nil {
			backend.Logger.Error("failed to close database connection", "error", err)
		}
	}()

	columns := requestedColumns
	if len(columns) == 0 {
		cols, err := p.fetchColumnsForTable(ctx, table, nil)
		if err != nil {
			return nil, err
		}
		columns = make([]string, len(cols))
		for i, col := range cols {
			columns[i] = col.Name
		}
	}

	values := make(map[string][]string)
	if len(columns) == 0 {
		return values, nil
	}

	// Build a single UNION ALL query so all columns are fetched in one round-trip
	// instead of one query per column.
	parts := make([]string, len(columns))
	for i, col := range columns {
		parts[i] = fmt.Sprintf(
			"SELECT '%s' AS col_name, toString(%s) AS val FROM (SELECT DISTINCT %s FROM %s SETTINGS max_execution_time=10)",
			escapeSQLString(col), quoteIdentifier(col), quoteIdentifier(col), table,
		)
		values[col] = make([]string, 0)
	}
	query := strings.Join(parts, " UNION ALL ")

	rows, err := ds.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := rows.Close(); err != nil {
			backend.Logger.Error("failed to close rows", "error", err)
		}
	}()

	for rows.Next() {
		var colName, value string
		if err := rows.Scan(&colName, &value); err != nil {
			return nil, err
		}
		values[colName] = append(values[colName], value)
	}
	return values, nil
}

// NewSchemaProvider builds a SchemaProvider and, if schema caching is enabled
// in the datasource settings, initializes per-handler TTL caches. Settings
// parsing failures degrade to a cache-disabled provider so the query builder
// still works — we never want schema introspection to be gated on cache
// availability.
func NewSchemaProvider(ctx context.Context, clickhousePlugin *Clickhouse, settings backend.DataSourceInstanceSettings) *SchemaProvider {
	p := &SchemaProvider{clickhousePlugin: clickhousePlugin, settings: settings}

	parsed, err := LoadSettings(ctx, settings)
	if err != nil || !parsed.EnableSchemaCache {
		return p
	}

	ttl := time.Duration(parsed.SchemaCacheTTLSeconds) * time.Second
	// ±5% jitter to avoid stampedes when many entries are populated in a
	// burst (typical on first dashboard load). Width of the uniform band,
	// not the half-width — see schemacache.New godoc.
	jitter := ttl / 10

	// Tables: one entry ever (the full "all tables" list). Use max=1 to
	// make that explicit and keep the map tiny.
	p.tablesCache = schemacache.New[[]string](ttl, jitter, 1)
	// Columns and values: the key is the requested table set, so there's
	// one entry per distinct request shape. 256 is generous for typical
	// dashboards; the bound matters mainly for ad-hoc filter use.
	p.columnsCache = schemacache.New[map[string][]schemas.Column](ttl, jitter, 256)
	p.valuesCache = schemacache.New[map[string][]string](ttl, jitter, 256)

	return p
}
