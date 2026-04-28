---
description: Use template variables with the ClickHouse data source to build dynamic dashboards
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
  - variables
menuTitle: Template variables
title: ClickHouse template variables
weight: 40
version: 0.1
last_reviewed: 2026-04-24
---

# ClickHouse template variables

Template variables let you parameterize your dashboards so you can change databases, tables, environments, or other values from a drop-down without editing each query. This makes dashboards more interactive, reusable, and easier to maintain.

For an introduction to templating and variable types, see [Templating](https://grafana.com/docs/grafana/latest/variables/) and [Add variables](https://grafana.com/docs/grafana/latest/dashboards/variables/add-template-variables/).

## Before you begin

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/).

## Create a query variable

To create a template variable that gets its values from ClickHouse:

1. Open the dashboard where you want to add the variable.
2. Click **Dashboard settings** (gear icon) in the top navigation.
3. Select **Variables** in the left menu.
4. Click **Add variable**.
5. Enter a **Name** for your variable (for example, `database`, `table`, or `environment`). Use a name you can reference in queries (for example, `$database`).
6. In the **Type** drop-down, select **Query**.
7. In the **Data source** drop-down, select your ClickHouse data source.
8. In the **Query** field, enter a ClickHouse SQL query that returns the values for the variable. The query can return one column (same label and value) or two columns (value and label). See [How query results become variable options](#how-query-results-become-variable-options) and [Query examples](#query-examples).
9. Click **Run query** to preview the variable options.
10. Set **Refresh** to control when the variable options update (see [Variable refresh options](#variable-refresh-options)).
11. Configure **Multi-value** or **Include All option** if needed.
12. Click **Apply** to save the variable.

## How query results become variable options

The plugin uses the query result to build the variable’s drop-down options:

- **Single column:** Each row becomes one option. Both the displayed label and the value used in queries are that column’s value.
- **Two columns:** The first column is used as the **value** (for example, an id or key). The second column is used as the **text** (the label shown in the drop-down).

**Example — single column (database names as label and value):**

```sql
SELECT name FROM system.databases WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema')
```

You can omit the `WHERE` clause if your ClickHouse instance does not have those databases (for example, a standalone ClickHouse server typically only has `default` and `system`).

**Example — two columns (id as value, name as label):**

```sql
SELECT id, name FROM my_app.environments
```

Here, the drop-down shows `name`, and queries receive `id` when the variable is used.

## Variable syntax in queries

Use variables in your ClickHouse queries by referencing them with `$varname` or `${varname}`. Grafana replaces the variable with the selected value (or values) before the query is sent to ClickHouse.

For full syntax and options, see [Variable syntax](https://grafana.com/docs/grafana/latest/variables/syntax/).

## Format options for safe SQL

To avoid SQL syntax or injection issues, use a **format** when the variable is used inside a string or list:

- **singlequote** — Wraps each value in single quotes and escapes single quotes inside the value. Use this for string literals and `IN` lists in ClickHouse.

**Example — filter by one database:**

```sql
SELECT * FROM system.tables WHERE database = ${database:singlequote}
```

**Example — filter by multiple databases (multi-value variable):**

```sql
SELECT * FROM system.tables WHERE database IN (${database:singlequote})
```

Without `:singlequote`, multi-value variables are comma-separated and can produce invalid SQL. Other formats (for example, **regex** or **pipe**) are described in [Variable syntax](https://grafana.com/docs/grafana/latest/variables/syntax/).

## Cascading (dependent) variables

You can make one variable depend on another by using the first variable in the second variable’s query. When the user changes the first variable, the second variable’s options update automatically.

**Example: database → table**

1. Create a variable named `database` with query:

   ```sql
   SELECT name FROM system.databases WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema')
   ```

2. Create a variable named `table` with query:

   ```sql
   SELECT name FROM system.tables WHERE database = ${database:singlequote}
   ```

When you change the selected database, the table drop-down refreshes with tables from that database.

## Using the "All" option with `$__conditionalAll`

If you enable **Include All option** for a variable, selecting **All** sets the variable value to `$__all`. A condition like `WHERE database IN (${database:singlequote})` may not behave as intended when **All** is selected.

Use the **$\_\_conditionalAll(condition, $variable)** macro so that:

- When the variable is **not** "All", the macro is replaced by the condition (for example, `database IN ('db1', 'db2')`).
- When the variable **is** "All", the macro is replaced by `1=1` (no filter).

**Example:**

```sql
SELECT count() FROM system.tables
WHERE $__conditionalAll(database IN (${database:singlequote}), $database)
```

When the user selects one or more databases, the condition filters by those databases. When the user selects **All**, the condition becomes `1=1` and all databases are included for optimization.

{{< admonition type="note" >}}
The second argument to `$__conditionalAll` must be a plain variable reference (`$database` or `${database}`). Do not use format specifiers like `${database:singlequote}` in the second argument — the macro will not detect the "All" selection correctly. Format specifiers should only be used in the **first** argument (the condition).
{{< /admonition >}}

See the [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) Macros section for the full list of macros.

## Query examples

| Use case                                     | Query                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| List databases                               | `SELECT name FROM system.databases` (optionally add `WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema')` to exclude those if present) |
| List tables (for chosen database)            | `SELECT name FROM system.tables WHERE database = ${database:singlequote}`                                                                         |
| List columns (for chosen database and table) | `SELECT name FROM system.columns WHERE database = ${database:singlequote} AND table = ${table:singlequote}`                                       |
| Distinct values for a column                 | `SELECT DISTINCT environment FROM my_app.events ORDER BY environment`                                                                             |

Replace `my_app.events` and column names with your own database, table, and columns.

## Variable refresh options

Set **Refresh** to control when the variable’s query runs and the options update:

| Option                   | Behavior                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **On dashboard load**    | Options refresh when the dashboard loads. Use for data that changes infrequently (for example, database or table lists). |
| **On time range change** | Options refresh when the dashboard time range changes. Use only if your variable query depends on the time range.        |

For dashboards with many variables or heavy variable queries, **On dashboard load** is usually sufficient and avoids unnecessary load.

## Multi-value variables

When **Multi-value** is enabled, users can select more than one value. The selected values are typically comma-separated when substituted into the query. Use the **singlequote** format so each value is correctly quoted in SQL:

```sql
WHERE database IN (${database:singlequote})
```

When one variable’s query uses another variable (cascading variables) and that other variable is multi-value, Grafana often substitutes only the first selected value. Ensure that the first value alone still gives a valid and useful list for the dependent variable.

## Ad hoc filters

Ad hoc filters let you add key/value filters that are applied to queries that use the ClickHouse data source. You choose filter values from a drop-down in the dashboard without editing the query. Ad hoc filters are supported only with **ClickHouse 22.7 or later**. For an overview, see [Grafana ad hoc filters](https://grafana.com/docs/grafana/latest/variables/variable-types/add-ad-hoc-filters/).

By default, the ad hoc filter drop-down lists all tables and columns from the data source. If you set a default database in the data source settings, only tables from that database are used. To limit which tables or columns appear (for example, to avoid slow loads), add a dashboard variable of type **Constant** named `clickhouse_adhoc_query`. Set its value to one of:

- A single database name (for example, `my_database`) — shows tables and columns from that database only.
- `database.table` (for example, `my_database.my_table`) — shows only columns for that specific table.
- A `SELECT` query — uses the query results to populate filter keys. See [Use a query to populate ad hoc filters](#use-a-query-to-populate-ad-hoc-filters).

You can hide this variable from the dashboard; it is only used to scope the ad hoc filter options.

{{< admonition type="note" >}}
Ad hoc filter values loaded from the schema are limited to **1000 distinct values** per column. If a column has more than 1000 distinct values, only the first 1000 are shown in the filter drop-down.
{{< /admonition >}}

## Use a query to populate ad hoc filters

You can set `clickhouse_adhoc_query` to a **ClickHouse query** instead of a database or table name. The query results are used to populate the ad hoc filter’s selectable values. For example, set the variable value to:

```sql
SELECT DISTINCT machine_name FROM mgbench.logs1
```

Then the dashboard filter drop-down lists distinct `machine_name` values, and you can filter queries by the selected machine.

### Dynamic column values with `$__adhoc_column`

When using a `SELECT` query in `clickhouse_adhoc_query`, you can use the `$__adhoc_column` placeholder to make the query dynamic. The plugin replaces `$__adhoc_column` with the column name that the user selected as the filter key.

This is useful when you want the filter **values** drop-down to be populated by a query rather than by scanning the schema. For example, set `clickhouse_adhoc_query` to:

```sql
SELECT DISTINCT $__adhoc_column FROM my_database.my_table
```

When the user selects a column (for example, `status`) in the ad hoc filter key drop-down, the plugin runs `SELECT DISTINCT status FROM my_database.my_table` to populate the value drop-down. The filter keys themselves are derived from the table's columns in `system.columns`.

## Supported ad hoc filter operators

Ad hoc filters support the following operators:

| Operator | ClickHouse equivalent | Description |
|----------|----------------------|-------------|
| `=` | `=` | Equals |
| `!=` | `!=` | Not equals |
| `<` | `<` | Less than |
| `>` | `>` | Greater than |
| `=~` | `ILIKE` | Case-insensitive pattern match (use `%` as wildcard) |
| `!~` | `NOT ILIKE` | Negated case-insensitive pattern match |
| `IN` | `IN (...)` | Matches any value in a list |

## Hide table name in ad hoc filter keys

By default, ad hoc filter keys are shown as `table.column`. To show only the column name (without the table prefix), enable the **Hide table name in ad hoc filters** option in the data source settings. This makes the filter drop-down cleaner when all queries target the same table.

## Map and JSON types (OpenTelemetry)

Ad hoc filters work with Map and JSON types for OpenTelemetry data. **Map** is the default and turns merged labels into a filter. To use **JSON** syntax for the filter logic, add a dashboard variable of type **Constant** named `clickhouse_adhoc_use_json`. The variable’s value is ignored; it only needs to exist.

## Apply ad hoc filters manually with `$__adHocFilters`

By default, ad hoc filters are applied automatically by detecting the target table from your SQL. For queries that use CTEs, subqueries, or ClickHouse-specific syntax (for example `INTERVAL` or parameterized aggregate functions), automatic detection can fail. In those cases, use the `$__adHocFilters('table_name')` macro to specify where to apply the filters.

The macro expands to the ClickHouse `additional_table_filters` setting with the currently active ad hoc filter conditions. Place it in the **SETTINGS** clause of your query.

{{< admonition type="note" >}}
When `$__adHocFilters` is present in a query, the plugin skips automatic ad hoc filter injection for that query. Use either the macro **or** automatic injection for a given query, not both.
{{< /admonition >}}

Example:

```sql
SELECT *
FROM (
  SELECT * FROM my_complex_table
  WHERE complicated_condition
) AS result
SETTINGS $__adHocFilters('my_complex_table')
```

When ad hoc filters are active (for example, `status = 'active'` and `region = 'us-west'`), the macro expands to:

```sql
SETTINGS additional_table_filters={'my_complex_table': 'status = \'active\' AND region = \'us-west\''}
```

## Next steps

- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Macros (including `$__timeFilter`, `$__conditionalAll`) and building queries.
- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/) — Connection and authentication options.
- [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) — Common errors and solutions.
