package plugin

import (
	"context"
	"fmt"
	"strings"

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
	searchOperators = []schemas.Operator{
		schemas.OperatorLike,
	}
)

type SchemaProvider struct {
	clickhousePlugin *Clickhouse
	settings         backend.DataSourceInstanceSettings
}

// Schema implements [schemas.SchemaHandler].
func (p *SchemaProvider) Schema(ctx context.Context, req *schemas.SchemaRequest) (*schemas.SchemaResponse, error) {
	tableResponse, err := p.Tables(ctx, &schemas.TablesRequest{})
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
		columns, err := p.fetchColumnsForTable(ctx, table, nil)
		if err != nil {
			response.Errors = fmt.Sprintf("error fetching columns for table %s: %s", table, err.Error())
			continue
		}
		response.FullSchema.Tables = append(response.FullSchema.Tables, schemas.Table{
			Name:    table,
			Columns: columns,
		})
	}
	return response, nil
}

// Tables implements [schemas.TablesHandler].
func (p *SchemaProvider) Tables(ctx context.Context, req *schemas.TablesRequest) (*schemas.TablesResponse, error) {
	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return &schemas.TablesResponse{
			Errors: map[string]string{
				"A": err.Error(),
			},
		}, nil
	}

	// get databases
	rows, err := ds.QueryContext(ctx, "SHOW DATABASES")
	if err != nil {
		return &schemas.TablesResponse{
			Errors: map[string]string{
				"A": err.Error(),
			},
		}, nil
	}
	defer rows.Close()
	databases := make([]string, 0)
	for rows.Next() {
		var database string
		err := rows.Scan(&database)
		if err != nil {
			return &schemas.TablesResponse{
				Errors: map[string]string{
					"A": err.Error(),
				},
			}, nil
		}
		databases = append(databases, database)
	}

	tables := make([]string, 0)
	// get tables for each database
	for _, database := range databases {
		tablesRows, err := ds.QueryContext(ctx, fmt.Sprintf("SHOW TABLES FROM \"%s\"", database))
		if err != nil {
			return &schemas.TablesResponse{
				Errors: map[string]string{
					"A": err.Error(),
				},
			}, nil
		}
		defer tablesRows.Close()
		for tablesRows.Next() {
			var table string
			err := tablesRows.Scan(&table)
			if err != nil {
				return &schemas.TablesResponse{
					Errors: map[string]string{
						"A": err.Error(),
					},
				}, nil
			}
			tables = append(tables, fmt.Sprintf("%s.%s", database, table))
		}
	}
	return &schemas.TablesResponse{Tables: tables}, nil
}

// Columns implements [schemas.ColumnsHandler].
func (p *SchemaProvider) Columns(ctx context.Context, req *schemas.ColumnsRequest) (*schemas.ColumnsResponse, error) {
	columns := make(map[string][]schemas.Column)
	errors := make(map[string]string)

	for _, table := range req.Tables {
		if table == "" {
			continue
		}
		cols, err := p.fetchColumnsForTable(ctx, table, req.Headers)
		if err != nil {
			errors[table] = err.Error()
			continue
		}
		columns[table] = cols
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
	defer rows.Close()
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
	// Strip parameters e.g. "Nullable(String)" -> "nullable(string)", "Decimal(10,2)" -> "decimal"
	baseType := strings.ToLower(strings.TrimSpace(chType))
	if idx := strings.Index(chType, "("); idx >= 0 {
		baseType = chType[:idx]
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
	case "string", "fixedstring()", "ipv6", "uuid":
		return schemas.ColumnTypeString, equalityOperators
	case "decimal", "decimal32", "decimal64", "decimal128", "decimal256":
		return schemas.ColumnTypeDecimal, numberOperators
	case "enum":
		return schemas.ColumnTypeEnum, equalityOperators
	case "json", "dynamic", "array()", "map()", "tuple()", "variant()", "lowcardinality()", "nested()":
		return schemas.ColumnTypeJSON, equalityOperators
	default:
		// Nullable(X) - recurse into inner type
		if strings.HasPrefix(chType, "nullable(") {
			if inner := strings.TrimPrefix(chType, "nullable("); len(inner) > 0 && strings.HasSuffix(inner, ")") {
				return mapClickHouseTypeToSchema(inner[:len(inner)-1])
			}
		} else {
			backend.Logger.Error("mapClickHouseTypeToSchema", "unknown type", chType)
		}
	}
	return schemas.ColumnTypeString, searchOperators
}

// ColumnValues implements [schemas.ColumnValuesHandler].
func (p *SchemaProvider) ColumnValues(ctx context.Context, req *schemas.ColumnValuesRequest) (*schemas.ColumnValuesResponse, error) {
	ds, err := p.clickhousePlugin.Connect(ctx, p.settings, nil)
	if err != nil {
		return &schemas.ColumnValuesResponse{
			Errors: map[string]string{
				req.Table: err.Error(),
			},
		}, nil
	}
	defer ds.Close()

	columns := req.Columns
	if len(columns) == 0 {
		cols, err := p.fetchColumnsForTable(ctx, req.Table, nil)
		if err != nil {
			return &schemas.ColumnValuesResponse{
				Errors: map[string]string{
					req.Table: err.Error(),
				},
			}, nil
		}
		columns = make([]string, len(cols))
		for i, col := range cols {
			columns[i] = col.Name
		}
	}

	response := &schemas.ColumnValuesResponse{
		ColumnValues: make(map[string][]string),
	}
	for _, column := range columns {
		rows, err := ds.QueryContext(ctx, fmt.Sprintf("SELECT DISTINCT %s FROM %s SETTINGS max_execution_time=10", column, req.Table))
		if err != nil {
			return &schemas.ColumnValuesResponse{
				Errors: map[string]string{
					req.Table: err.Error(),
				},
			}, nil
		}
		defer rows.Close()
		values := make([]string, 0)
		for rows.Next() {
			var value string
			err := rows.Scan(&value)
			if err != nil {
				return &schemas.ColumnValuesResponse{
					Errors: map[string]string{
						req.Table: err.Error(),
					},
				}, nil
			}
			values = append(values, value)
		}

		response.ColumnValues[column] = values
	}

	return response, nil
}

func NewSchemaProvider(clickhousePlugin *Clickhouse, settings backend.DataSourceInstanceSettings) *SchemaProvider {
	return &SchemaProvider{clickhousePlugin: clickhousePlugin, settings: settings}
}
