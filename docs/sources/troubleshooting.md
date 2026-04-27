---
description: Solutions for common errors when using the ClickHouse data source
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
  - troubleshooting
menuTitle: Troubleshooting
title: Troubleshoot ClickHouse data source issues
weight: 70
version: 0.1
last_reviewed: 2026-04-27
---

## Troubleshoot ClickHouse data source issues

This guide provides solutions for common errors you may encounter when configuring or using the ClickHouse data source for Grafana.

### Connection Errors

Invalid Server Host

**Error message:** "invalid server host. Either empty or not set"

**Cause:** The server host field is empty or was not configured in the data source settings.

**Solution:**

1. Open the data source configuration in Grafana.
2. Verify that the **Server** field contains a valid hostname or IP address.
3. Ensure there are no leading or trailing spaces in the host value.

---

Invalid Port

**Error message:** "invalid port"

**Cause:** The port number is missing, empty, or contains an invalid value.

**Solution:**

1. Open the data source configuration in Grafana.
2. Verify that the **Port** field contains a valid port number.
3. Use the default port `9000` for native protocol or `8123` for HTTP protocol.
4. Ensure the port value is a number without any special characters.

---

Failed to Create ClickHouse Client

**Error message:** "failed to create ClickHouse client" or "failed to create data source"

**Cause:** The plugin was unable to establish a connection to the ClickHouse server. This is the most commonly reported ClickHouse error. The error message is intentionally generic — the actual root cause can be any of the issues listed below.

**Solution:**

Work through the following checks in order. Most cases are resolved by one of the first four items.

1. **Clear the Default database field.** This is one of the most common fixes. If you are connecting to **ClickHouse Cloud**, leave it blank — setting an explicit database name that does not match the service's configured database causes this error. For details, see [Default database guidance](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/#default-database-guidance).
2. **Verify credentials.** Confirm that the username and password are correct for the ClickHouse server. A typo or stale password is a frequent cause.
3. **Check ClickHouse user permissions.** The connection test may pass, but queries can still fail if the user lacks permission to modify settings such as `max_execution_time`. See [Required SETTINGS permissions](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/#required-settings-permissions).
4. **Confirm network connectivity.** Verify that the ClickHouse server is running and reachable from the Grafana server on the configured port. Ensure no firewall rules or security groups are blocking the connection.
5. **Review the hostname and port.** Check for leading/trailing spaces and confirm the port matches the protocol (Native: 9000/9440, HTTP: 8123/8443).
6. **Verify TLS configuration.** If using TLS/SSL, confirm that certificates are correctly configured and the port supports TLS.
7. **Check Grafana Cloud data source quotas.** On Grafana Cloud, verify that the data source is being added to the correct stack and that you have not reached the data source quota for your plan.
8. **Test from the command line.** Run `clickhouse-client` from the Grafana server to isolate whether the problem is network/ClickHouse-side or Grafana-side.
9. **Check Grafana server logs.** The server logs often contain a more detailed error message that narrows down the root cause.

---

Connection Timeout

**Error message:** "connection timeout" or "the operation was cancelled before starting: context deadline exceeded"

**Cause:** The connection to the ClickHouse server timed out before it could be established.

**Solution:**

1. Verify that the ClickHouse server is reachable from the Grafana server.
2. Increase the **Dial Timeout** value in the data source settings (default is 10 seconds).
3. Check for network latency or connectivity issues between Grafana and ClickHouse.
4. Ensure no firewall or security group is blocking the connection.

---

Operation Cancelled During Execution

**Error message:** "the operation was cancelled during execution: context deadline exceeded"

**Cause:** The query or connection operation exceeded the configured timeout while running.

**Solution:**

1. Increase the **Query Timeout** value in the data source settings (default is 60 seconds).
2. Optimize your query to reduce execution time.
3. Check if the ClickHouse server is under heavy load.
4. Consider adding appropriate indexes to your ClickHouse tables.

---

Plugin Not Found After Installation (Grafana Cloud)

**Error message:** 404 error when adding the ClickHouse data source, or the plugin does not appear in the data source list after installation.

**Cause:** New Grafana Cloud instances on the **Fast** release channel may not yet have the ClickHouse plugin available. The Fast channel receives Grafana updates earlier, but plugin availability can lag behind.

**Solution:**

1. [Open a support ticket](https://grafana.com/profile/org#support) and request that your instance be moved to the **Steady** release channel.
2. After the channel change takes effect, reinstall or re-add the ClickHouse data source.
3. Once the plugin is working, you can discuss with support whether switching back to the Fast channel is safe for your use case.

---

### Authentication Errors

Invalid Username

**Error message:** "username is either empty or not set"

**Cause:** The username field is empty or was not configured in the data source settings.

**Solution:**

1. Open the data source configuration in Grafana.
2. Enter a valid ClickHouse username in the **Username** field.
3. Verify that the user exists in ClickHouse and has appropriate permissions.

---

Invalid Password

**Error message:** "password is either empty or not set"

**Cause:** The password field is empty or was not configured when authentication requires a password.

**Solution:**

1. Open the data source configuration in Grafana.
2. Enter the correct password in the **Password** field.
3. Verify that the password matches the one configured in ClickHouse for the specified user.

---

### TLS/SSL Certificate Errors

Invalid CA Certificate

**Error message:** "failed to parse TLS CA PEM certificate"

**Cause:** The CA certificate provided is not in valid PEM format or is corrupted.

**Solution:**

1. Verify that the CA certificate is in PEM format (begins with `-----BEGIN CERTIFICATE-----`).
2. Ensure the entire certificate content is copied, including the BEGIN and END markers.
3. Check that there are no extra spaces or line breaks in the certificate.
4. Regenerate the CA certificate if it may be corrupted.

---

Invalid Client Certificate

**Error message:** "tls: failed to find any PEM data in certificate input"

**Cause:** The client certificate or key provided is not in valid PEM format or is empty.

**Solution:**

1. Verify that both the client certificate and client key are in PEM format.
2. Ensure the client certificate begins with `-----BEGIN CERTIFICATE-----`.
3. Ensure the client key begins with `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`.
4. Check that the certificate and key match (were generated together).
5. Verify that the entire content is copied without truncation.

---

### Protocol Errors

Invalid Protocol

**Error message:** "protocol is invalid, use native or http"

**Cause:** An unsupported protocol was specified in the data source configuration.

**Solution:**

1. Open the data source configuration in Grafana.
2. Set the **Protocol** to either `native` or `http`.
3. Use `native` (port 9000) for better performance or `http` (port 8123) for HTTP-based connectivity.

---

### Configuration Parsing Errors

Invalid JSON Configuration

**Error message:** "could not parse json"

**Cause:** The data source configuration contains invalid JSON syntax.

**Solution:**

1. If you are provisioning the data source via YAML/JSON files, validate the JSON syntax.
2. Use a JSON validator to check for syntax errors.
3. Ensure all string values are properly quoted and special characters are escaped.
4. Re-save the data source configuration through the Grafana UI.

---

## Could Not Parse Configuration Values

**Error messages:**

- "could not parse port value"
- "could not parse secure value"
- "could not parse tlsSkipVerify value"
- "could not parse tlsAuth value"
- "could not parse tlsAuthWithCACert value"
- "could not parse forwardGrafanaHeaders value"

**Cause:** A configuration value could not be converted to the expected type (boolean or number).

**Solution:**

1. Verify that boolean values are set to `true` or `false` (without quotes in JSON, or as strings `"true"`/`"false"`).
2. Verify that numeric values like port are valid integers.
3. Re-configure the data source through the Grafana UI to ensure proper value types.

---

Invalid Timeout Values

**Error messages:**

- "invalid timeout: [value]"
- "invalid query timeout: [value]"

**Cause:** The dial timeout or query timeout value is not a valid integer.

**Solution:**

1. Open the data source configuration in Grafana.
2. Ensure the **Dial Timeout** and **Query Timeout** fields contain valid integer values (in seconds).
3. Remove any non-numeric characters from the timeout fields.

---

### Permission and Settings Errors

Setting Is Locked (readonly)

**Error message:** "DB::Exception: Cannot modify 'max_execution_time': Setting is locked (in readonly mode)"

**Cause:** The ClickHouse user has `readonly = 1` but does not have permission to modify the `max_execution_time` setting, which the plugin's client needs to enforce query timeouts.

**Solution:**

1. Create a settings profile or constraint that allows `max_execution_time` to be changed in read-only mode:
   ```sql
   ALTER SETTINGS PROFILE grafana_reader
     SETTINGS readonly = 1,
     SETTINGS max_execution_time CHANGEABLE_IN_READONLY;
   ```
2. Assign this profile to the Grafana ClickHouse user.
3. Verify the fix by running `SELECT 1 SETTINGS max_execution_time = 30` as the Grafana user in `clickhouse-client`.

For more details on configuring permissions, refer to [ClickHouse user and permissions](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/#clickhouse-user-and-permissions).

---

### Query Builder Issues

Empty Database, Table, or Column Dropdowns

**Symptoms:** The database, table, or column dropdowns in the query builder show no options, or they briefly attempt to load and then appear empty.

**Cause:** The plugin queries ClickHouse system tables (`system.databases`, `system.columns`) to populate these dropdowns. If the ClickHouse user lacks permission to read those system tables, or if a network or timeout issue prevents the query from completing, the dropdowns will be empty without a visible error message in the panel — the error is logged only to the browser console.

**Solution:**

1. Open the browser developer console (**F12** > **Console**) and look for errors from the ClickHouse data source.
2. Verify the ClickHouse user has `SELECT` permission on `system.databases`, `system.tables`, and `system.columns`.
3. If the ClickHouse server is slow or under heavy load, the schema query may time out. Wait and try again, or optimize the server's load.
4. Test the data source connection with **Save & test** to confirm basic connectivity.

---

Column Value Suggestions Time Out on Large Tables

**Symptoms:** Autocomplete suggestions for column values in the query builder are slow or return no results.

**Cause:** The plugin runs `SELECT DISTINCT` queries for each column with `SETTINGS max_execution_time=10`. On tables with millions of rows or high-cardinality columns, this query can time out before completing.

**Solution:**

1. Use simpler filter values that you type manually rather than relying on autocomplete.
2. Create a materialized view or dictionary with pre-aggregated distinct values for frequently filtered columns.
3. Add a `clickhouse_adhoc_query` variable with a targeted `SELECT` query instead of relying on schema-driven suggestions.

---

### Query Errors

ClickHouse Database Exception

**Error message:** "DB::Exception: [error details]"

**Cause:** ClickHouse returned an error while executing your query. Common causes include syntax errors, missing tables, or permission issues.

**Solution:**

1. Review the error message for specific details about the issue.
2. Verify your SQL syntax is correct for ClickHouse.
3. Check that referenced tables and columns exist.
4. Ensure the configured user has permission to access the requested data.
5. Test the query directly in `clickhouse-client` to isolate the issue.

---

Macro Argument Count Error

**Error messages:**

- "$\_\_timeFilter: expected 1 argument, received [n]"
- "$\_\_timeFilter_ms: expected 1 argument, received [n]"
- "$\_\_dateFilter: expected 1 argument, received [n]"
- "$\_\_dateTimeFilter: expected 2 arguments, received [n]"
- "$\_\_timeInterval: expected 1 argument, received [n]"
- "$\_\_timeInterval_ms: expected 1 argument, received [n]"

**Cause:** A Grafana macro was used with the wrong number of arguments.

**Solution:**

1. Check the macro syntax in your query:
   - `$__timeFilter(column)` - requires 1 argument (the time column)
   - `$__timeFilter_ms(column)` - requires 1 argument (the time column for millisecond precision)
   - `$__dateFilter(column)` - requires 1 argument (the date column)
   - `$__dateTimeFilter(dateColumn, timeColumn)` - requires 2 arguments
   - `$__timeInterval(column)` - requires 1 argument (the time column)
   - `$__timeInterval_ms(column)` - requires 1 argument (the time column)
2. Ensure arguments are separated by commas if multiple are required.

---

SQL Parse Error

**Error message:** Parse error with line and column information

**Cause:** The SQL query contains syntax errors that could not be parsed.

**Solution:**

1. Review the error message for the specific line and column where the error occurred.
2. Check for common SQL syntax issues like missing commas, unmatched parentheses, or incorrect keywords.
3. Verify that ClickHouse-specific syntax is being used correctly.
4. Use the Query Builder mode to construct queries if you're unfamiliar with ClickHouse SQL.

---

### Ad Hoc Filter Errors

Unable to Apply Ad Hoc Filters

**Error message:** "Unable to apply ad hoc filters. Upgrade ClickHouse to >=22.7 or remove ad hoc filters for the dashboard."

**Cause:** Ad hoc filters require ClickHouse version 22.7 or higher, which introduced the `additional_table_filters` setting.

**Solution:**

1. Upgrade your ClickHouse server to version 22.7 or higher.
2. Alternatively, remove the ad hoc filter variable from your dashboard.
3. Use regular template variables as a workaround if upgrading is not possible.

---

Failed to Get Table from Ad Hoc Query

**Error message:** "Failed to get table from adhoc query."

**Cause:** The plugin could not determine which table to apply ad hoc filters to from the query.

**Solution:**

1. Ensure your query contains a valid `FROM` clause with a table name.
2. If using a complex query with subqueries or CTEs, consider using a simpler query structure.
3. Explicitly specify the table in the ad hoc filter configuration variable.

---

Ad Hoc Filters Produce Incorrect or Missing Results

**Symptoms:**

- Filters on column names that contain dots (for example, `raw.log.CONTEXT.subscriber`) are truncated to just the first segment (for example, `raw`), producing invalid or overly broad filters.
- Filters silently stop being applied when the query contains a complex multi-condition `WHERE` clause. The `SETTINGS additional_table_filters` injection stops working entirely, and no error is shown.

**Solution:**

1. **Upgrade to plugin v4.12.0 or later.** Both issues were fixed in v4.12.0:
   - Column names with dots are now handled correctly ([#1481](https://github.com/grafana/clickhouse-datasource/pull/1481)).
   - You can now manually control where ad hoc filters are placed in a query, which prevents silent injection failures in complex `WHERE` clauses ([#1488](https://github.com/grafana/clickhouse-datasource/pull/1488)).
2. **Manual filter placement (v4.12.0+):** If you have a complex query where automatic filter injection fails, use the `$__adHocFilters('table_name')` macro to explicitly specify where filters are applied. Place it in the `SETTINGS` clause. For details and examples, see [Apply ad hoc filters manually](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/#apply-ad-hoc-filters-manually-with-__adHocFilters).
3. **Older plugin versions:** If you cannot upgrade, avoid column names with dots in ad hoc filters (use a ClickHouse [alias](https://clickhouse.com/docs/en/sql-reference/statements/create/table#alias) to flatten nested paths), and simplify complex `WHERE` clauses or move them into a subquery.

---

Invalid Ad Hoc Filter

**Error message:** "Invalid adhoc filter will be ignored: [filter details]"

**Cause:** An ad hoc filter is missing required fields (key, operator, or value).

**Solution:**

1. Verify that all ad hoc filters have a key (column name), operator, and value specified.
2. Check the filter configuration in your dashboard variables.
3. Remove any incomplete filter definitions.

---

### Log Context Errors

Missing Query for Log Context

**Error message:** "Missing query for log context"

**Cause:** The log context feature was invoked without a valid query.

**Solution:**

1. Ensure you're using the log context feature with a valid logs query.
2. Verify that the query is using the Builder editor mode.

---

Missing Log Context Options

**Error message:** "Missing log context options for query"

**Cause:** Required options for log context (direction or limit) are missing.

**Solution:**

1. This is typically an internal error. Try refreshing the page.
2. If the issue persists, report it as a bug.

---

Log Context Only Works for Builder Queries

**Error message:** "Log context feature only works for builder queries"

**Cause:** The log context feature was invoked on a SQL editor query instead of a Builder query.

**Solution:**

1. Switch your query from **SQL Editor** mode to **Builder** mode.
2. Configure your logs query using the Builder interface.

---

Missing Time Column for Log Context

**Error message:** "Missing time column for log context"

**Cause:** The query doesn't have a time column configured, which is required for log context.

**Solution:**

1. In the Query Builder, ensure you've selected a column with the **Time** hint.
2. Verify that your logs table has a timestamp column and it's properly configured.

---

Unable to Match Log Context Columns

**Error message:** "Unable to match any log context columns"

**Cause:** None of the configured context columns could be matched from the current log row's data frame.

**Solution:**

1. Verify that the **Context Columns** are configured in the data source settings under Logs configuration.
2. Ensure the configured context column names match the actual column names in your query results.
3. Check that the context columns are included in your SELECT statement.

---

### Proxy and Private Data Connect (PDC) Errors

Unable to Cast SOCKS Proxy Dialer

**Error message:** "unable to cast SOCKS proxy dialer to context proxy dialer"

**Cause:** There was an issue initializing the secure SOCKS proxy connection for Private Data Connect (PDC).

**Solution:**

1. Verify your PDC configuration is correct.
2. Check that the SOCKS proxy is properly configured and accessible.
3. Review Grafana server logs for more detailed error information.
4. Ensure your Grafana version supports the PDC feature.

---

PDC Connection Fails with No Agent Logs

**Error message:** "check PDC agent logs" (but no relevant logs appear in the PDC agent pod)

**Cause:** The PDC agent accepted the connection request but could not forward it to the target database. This commonly happens when the agent's authentication token has expired or become stale, or when the agent pod was restarted without refreshing credentials.

**Solution:**

1. Restart the PDC agent pod to force a fresh token handshake.
2. If using Kubernetes, delete the pod and let the deployment recreate it:
   ```bash
   kubectl delete pod <pdc-agent-pod-name> -n <namespace>
   ```
3. Regenerate or refresh the PDC agent token in the Grafana Cloud portal, then redeploy the agent with the new token.
4. After restarting, verify the agent logs show a successful registration message before retrying the data source connection.
5. Confirm that the PDC agent can reach the ClickHouse server on the required port from within its network.

---

Alerting Times Out via PDC While Dashboards Work

**Error message:** "i/o timeout", "datasourceError", or alert rule evaluations fail while dashboard queries using the same data source succeed.

**Cause:** Alert rule evaluation uses a different backend code path than dashboard queries. In some configurations, the PDC connection is available for interactive queries but the alerting backend cannot establish or maintain the tunneled connection, causing timeouts specifically for alert evaluations.

**Solution:**

1. Ensure you are using the **Grafana ClickHouse plugin** (`grafana-clickhouse-datasource`), not the community Altinity plugin. The Grafana plugin has better PDC compatibility for backend operations like alerting.
2. Upgrade to the latest plugin version — PDC-related alerting fixes have been included in recent releases.
3. Verify the PDC agent is healthy and not silently disconnected (see [PDC Connection Fails with No Agent Logs](#pdc-connection-fails-with-no-agent-logs) above).
4. Check the Grafana alerting logs for detailed timeout or connection errors by filtering for the data source name or UID.

---

Stale PDC Token — Metrics Suddenly Lost

**Symptoms:** ClickHouse dashboards that were previously working stop loading data. The PDC agent pod appears to be running, but all queries return errors or empty results. No obvious error is shown in Grafana.

**Cause:** The PDC agent's authentication token has expired. The agent pod continues running but can no longer relay connections to Grafana Cloud. This can happen silently, with no alerts from the agent itself.

**Solution:**

1. Restart the PDC agent pod to trigger a fresh token handshake:
   ```bash
   kubectl delete pod <pdc-agent-pod-name> -n <namespace>
   ```
2. If restarting doesn't resolve it, regenerate the PDC agent token in the Grafana Cloud portal and redeploy the agent with the new token.
3. After the agent is back, click **Save & test** on the data source to confirm connectivity.
4. To prevent recurrence, set up monitoring on the PDC agent pod — for example, a liveness probe or periodic health check that verifies the agent can relay a test query.

---

### Header Parsing Errors

Couldn't Parse Message as Args

**Error message:** "Couldn't parse message as args"

**Cause:** The plugin could not parse the forwarded headers message.

**Solution:**

1. This is typically an internal error related to header forwarding.
2. Check if **Forward Grafana Headers** is enabled and configured correctly.
3. Review Grafana server logs for more details.

---

Couldn't Parse Grafana HTTP Headers

**Error message:** "Couldn't parse grafana HTTP headers"

**Cause:** The Grafana HTTP headers could not be parsed from the request.

**Solution:**

1. Verify the header forwarding configuration.
2. Check that custom HTTP headers are properly formatted.
3. Review the data source configuration for any malformed header entries.

---

### Data Display Issues

Timestamp Millisecond Precision Lost

**Symptoms:** ClickHouse `DateTime64` timestamps with millisecond (or higher) precision display in Grafana with only second-level granularity. Milliseconds are truncated or shown as `.000` in both Explore and dashboard panels.

**Cause:** This is a known Grafana platform limitation — Grafana's default time formatter displays timestamps at second precision regardless of the underlying data. The ClickHouse plugin returns the full-precision value, but Grafana's display layer truncates it.

**Workaround for dashboards:**

1. Add a [Convert field type](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#convert-field-type) transformation to the panel.
2. Set the time column's format to a pattern that includes milliseconds, for example `YYYY-MM-DD HH:mm:ss.SSS`.

**Workaround for Explore:**

There is currently no transformation support in Explore. As an alternative, you can cast the timestamp to a string with millisecond precision directly in the SQL query:

```sql
SELECT
  formatDateTime(timestamp, '%Y-%m-%d %H:%i:%S') || '.' || toString(toUnixTimestamp64Milli(timestamp) % 1000) AS timestamp_ms,
  message
FROM my_table
WHERE $__timeFilter(timestamp)
```

{{< admonition type="note" >}}
This is a Grafana platform limitation, not specific to the ClickHouse plugin. A feature request for native sub-second display has been filed with the Grafana team.
{{< /admonition >}}

---

### Upgrade and Compatibility Issues

v3 to v4 Migration Problems

**Symptoms:** After upgrading from plugin v3 to v4, data source settings appear to be missing (blank host, no timeout), or saved dashboard queries no longer load in the query editor.

**Cause:** Plugin v4 renamed several configuration fields (`server` to `host`, `timeout` to `dialTimeout`) and restructured the query model (the `queryType` field changed from `sql`/`builder` to the new `editorType` format). The plugin includes automatic migration logic, but in some cases — especially with provisioned data sources — the migration may not run until the configuration page is opened.

**Solution:**

1. Open the data source configuration page in Grafana, then click **Save & test**. This triggers the frontend migration that copies v3 field values to v4 fields.
2. If provisioning via YAML or Terraform, update the field names manually:
   - `server` → `host`
   - `timeout` → `dialTimeout`
3. For dashboard queries that fail to load, open the dashboard and re-save it. The plugin automatically migrates v3 query formats to v4 when the query editor loads.
4. If individual panels still show errors, switch to the **SQL Editor** tab, verify the query, and re-save the panel.

---

Log Volume Not Showing in SQL Editor

**Symptoms:** The log volume histogram does not appear above log results when using the SQL editor in Explore. It works in the query builder.

**Cause:** Log volume support for SQL editor queries requires **Grafana 12.4.0 or later**. On older Grafana versions, log volume is only available for queries built with the query builder.

**Solution:**

1. Upgrade Grafana to version 12.4.0 or later.
2. Alternatively, switch the query to the **Builder** editor mode, which supports log volume on older Grafana versions.

---

Connection Pool Saturation (Sudden Slowness)

**Symptoms:** Queries become progressively slower or time out under concurrent load, even though individual queries run quickly when tested in isolation. The ClickHouse server itself is not overloaded.

**Cause:** The plugin uses a connection pool with default limits: **50 max open connections**, **25 max idle connections**, and **5-minute connection lifetime**. When many dashboard panels, alert rules, or concurrent users exhaust the pool, new queries queue until a connection becomes available.

**Solution:**

1. Reduce the number of concurrent queries by consolidating dashboard panels or staggering alert evaluation groups.
2. Increase the connection pool limits by adding custom settings in the data source provisioning configuration:
   ```yaml
   jsonData:
     maxOpenConns: "100"
     maxIdleConns: "50"
     connMaxLifetime: "10"
   ```
3. Monitor the ClickHouse server's `system.metrics` table (`CurrentMetric_TCPConnection`) to see whether the connection count from Grafana is approaching the server-side limit.
4. If using HTTP protocol, check whether a reverse proxy between Grafana and ClickHouse has its own connection limits.

---

### Getting More Help

If you continue to experience issues after trying the solutions in this guide:

1. Check the [ClickHouse documentation](https://clickhouse.com/docs) for database-specific issues.
2. Review the Grafana server logs for more detailed error messages.
3. Search or create issues in the [grafana-clickhouse-datasource GitHub repository](https://github.com/grafana/clickhouse-datasource).
4. Visit the [Grafana Community forums](https://community.grafana.com/) for community support.
