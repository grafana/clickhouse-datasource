---
description: This document outlines ad hoc filter options for the ClickHouse data source
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: Ad hoc filter for the ClickHouse data source
title: ClickHouse ad hoc filters
weight: 20
version: 0.1
---

### Ad Hoc Filters

Ad hoc filters are only supported with version 22.7+ of ClickHouse.

Ad hoc filters allow you to add key/value filters that are automatically added
to all metric queries that use the specified data source, without being
explicitly used in queries.

By default, Ad Hoc filters will be populated with all Tables and Columns. If
you have a default database defined in the Datasource settings, all Tables from
that database will be used to populate the filters. As this could be
slow/expensive, you can introduce a second variable to allow limiting the
Ad Hoc filters. It should be a `constant` type named `clickhouse_adhoc_query`
and can contain: a comma delimited list of databases, just one database, or a
database.table combination to show only columns for a single table.

Ad Hoc filters also work with the Map and JSON types for OTel data.
Map is the default, and will automatically convert the merged labels output into a usable filter.
To have the filter logic use JSON syntax, add a dashboard variable with a `constant` type called `clickhouse_adhoc_use_json` (the variable's `value` is ignored, it just has to be present).

For more information on Ad Hoc filters, check the [Grafana
docs](https://grafana.com/docs/grafana/latest/variables/variable-types/add-ad-hoc-filters/)

#### Using a query for Ad Hoc filters

The second `clickhouse_adhoc_query` also allows any valid ClickHouse query. The
query results will be used to populate your ad-hoc filter's selectable filters.
You may choose to hide this variable from view as it serves no further purpose.

For example, if `clickhouse_adhoc_query` is set to `SELECT DISTINCT
machine_name FROM mgbench.logs1` you would be able to select which machine
names are filtered for in the dashboard.

#### Manual Ad Hoc Filter Placement with `$__adHocFilters`

By default, ad-hoc filters are automatically applied to queries by detecting the
target table using SQL parsing. However, for queries that use CTEs or ClickHouse-specific
syntax like `INTERVAL` or aggregate functions with parameters, the automatic
detection may fail. In these cases, you can manually specify where to apply
ad-hoc filters using the `$__adHocFilters('table_name')` macro.

This macro expands to the ClickHouse `additional_table_filters` setting with the
currently active ad-hoc filters. It should be placed in the `SETTINGS` clause of
your query.

Example:

```sql
SELECT *
FROM (
  SELECT * FROM my_complex_table
  WHERE complicated_condition
) AS result
SETTINGS $__adHocFilters('my_complex_table')
```

When ad-hoc filters are active (e.g., `status = 'active'` and `region = 'us-west'`),
this expands to:

```sql
SELECT *
FROM (
  SELECT * FROM my_complex_table
  WHERE complicated_condition
) AS result
SETTINGS additional_table_filters={'my_complex_table': 'status = \'active\' AND region = \'us-west\''}
```
