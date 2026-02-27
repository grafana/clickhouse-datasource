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
weight: 40
version: 0.1
last_reviewed: 2026-02-11
---

# Troubleshoot ClickHouse data source issues

This guide provides solutions for common errors you may encounter when configuring or using the ClickHouse data source for Grafana.

## Connection Errors

## Invalid Server Host

**Error message:** "invalid server host. Either empty or not set"

**Cause:** The server host field is empty or was not configured in the data source settings.

**Solution:**

1. Open the data source configuration in Grafana.
2. Verify that the **Server** field contains a valid hostname or IP address.
3. Ensure there are no leading or trailing spaces in the host value.

---

## Invalid Port

**Error message:** "invalid port"

**Cause:** The port number is missing, empty, or contains an invalid value.

**Solution:**

1. Open the data source configuration in Grafana.
2. Verify that the **Port** field contains a valid port number.
3. Use the default port `9000` for native protocol or `8123` for HTTP protocol.
4. Ensure the port value is a number without any special characters.

---

## Failed to Create ClickHouse Client

**Error message:** "failed to create ClickHouse client"

**Cause:** The plugin was unable to establish a connection to the ClickHouse server. This can occur due to network issues, incorrect credentials, firewall rules, or server unavailability.

**Solution:**

1. Verify that the ClickHouse server is running and accessible from the Grafana server.
2. Check that the hostname, port, username, and password are correct.
3. Ensure there are no firewall rules blocking the connection.
4. If using TLS/SSL, verify that the certificates are correctly configured.
5. Test the connection using `clickhouse-client` from the Grafana server to isolate network issues.
6. Check the Grafana server logs for more detailed error information.

---

## Connection Timeout

**Error message:** "connection timeout" or "the operation was cancelled before starting: context deadline exceeded"

**Cause:** The connection to the ClickHouse server timed out before it could be established.

**Solution:**

1. Verify that the ClickHouse server is reachable from the Grafana server.
2. Increase the **Dial Timeout** value in the data source settings (default is 10 seconds).
3. Check for network latency or connectivity issues between Grafana and ClickHouse.
4. Ensure no firewall or security group is blocking the connection.

---

## Operation Cancelled During Execution

**Error message:** "the operation was cancelled during execution: context deadline exceeded"

**Cause:** The query or connection operation exceeded the configured timeout while running.

**Solution:**

1. Increase the **Query Timeout** value in the data source settings (default is 60 seconds).
2. Optimize your query to reduce execution time.
3. Check if the ClickHouse server is under heavy load.
4. Consider adding appropriate indexes to your ClickHouse tables.

---

## Authentication Errors

## Invalid Username

**Error message:** "username is either empty or not set"

**Cause:** The username field is empty or was not configured in the data source settings.

**Solution:**

1. Open the data source configuration in Grafana.
2. Enter a valid ClickHouse username in the **Username** field.
3. Verify that the user exists in ClickHouse and has appropriate permissions.

---

## Invalid Password

**Error message:** "password is either empty or not set"

**Cause:** The password field is empty or was not configured when authentication requires a password.

**Solution:**

1. Open the data source configuration in Grafana.
2. Enter the correct password in the **Password** field.
3. Verify that the password matches the one configured in ClickHouse for the specified user.

---

## TLS/SSL Certificate Errors

## Invalid CA Certificate

**Error message:** "failed to parse TLS CA PEM certificate"

**Cause:** The CA certificate provided is not in valid PEM format or is corrupted.

**Solution:**

1. Verify that the CA certificate is in PEM format (begins with `-----BEGIN CERTIFICATE-----`).
2. Ensure the entire certificate content is copied, including the BEGIN and END markers.
3. Check that there are no extra spaces or line breaks in the certificate.
4. Regenerate the CA certificate if it may be corrupted.

---

## Invalid Client Certificate

**Error message:** "tls: failed to find any PEM data in certificate input"

**Cause:** The client certificate or key provided is not in valid PEM format or is empty.

**Solution:**

1. Verify that both the client certificate and client key are in PEM format.
2. Ensure the client certificate begins with `-----BEGIN CERTIFICATE-----`.
3. Ensure the client key begins with `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`.
4. Check that the certificate and key match (were generated together).
5. Verify that the entire content is copied without truncation.

---

## Protocol Errors

## Invalid Protocol

**Error message:** "protocol is invalid, use native or http"

**Cause:** An unsupported protocol was specified in the data source configuration.

**Solution:**

1. Open the data source configuration in Grafana.
2. Set the **Protocol** to either `native` or `http`.
3. Use `native` (port 9000) for better performance or `http` (port 8123) for HTTP-based connectivity.

---

## Configuration Parsing Errors

## Invalid JSON Configuration

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

## Invalid Timeout Values

**Error messages:**
- "invalid timeout: [value]"
- "invalid query timeout: [value]"

**Cause:** The dial timeout or query timeout value is not a valid integer.

**Solution:**

1. Open the data source configuration in Grafana.
2. Ensure the **Dial Timeout** and **Query Timeout** fields contain valid integer values (in seconds).
3. Remove any non-numeric characters from the timeout fields.

---

## Query Errors

## ClickHouse Database Exception

**Error message:** "DB::Exception: [error details]"

**Cause:** ClickHouse returned an error while executing your query. Common causes include syntax errors, missing tables, or permission issues.

**Solution:**

1. Review the error message for specific details about the issue.
2. Verify your SQL syntax is correct for ClickHouse.
3. Check that referenced tables and columns exist.
4. Ensure the configured user has permission to access the requested data.
5. Test the query directly in `clickhouse-client` to isolate the issue.

---

## Macro Argument Count Error

**Error messages:**
- "$__timeFilter: expected 1 argument, received [n]"
- "$__timeFilter_ms: expected 1 argument, received [n]"
- "$__dateFilter: expected 1 argument, received [n]"
- "$__dateTimeFilter: expected 2 arguments, received [n]"
- "$__timeInterval: expected 1 argument, received [n]"
- "$__timeInterval_ms: expected 1 argument, received [n]"

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

## SQL Parse Error

**Error message:** Parse error with line and column information

**Cause:** The SQL query contains syntax errors that could not be parsed.

**Solution:**

1. Review the error message for the specific line and column where the error occurred.
2. Check for common SQL syntax issues like missing commas, unmatched parentheses, or incorrect keywords.
3. Verify that ClickHouse-specific syntax is being used correctly.
4. Use the Query Builder mode to construct queries if you're unfamiliar with ClickHouse SQL.

---

## Ad Hoc Filter Errors

## Unable to Apply Ad Hoc Filters

**Error message:** "Unable to apply ad hoc filters. Upgrade ClickHouse to >=22.7 or remove ad hoc filters for the dashboard."

**Cause:** Ad hoc filters require ClickHouse version 22.7 or higher, which introduced the `additional_table_filters` setting.

**Solution:**

1. Upgrade your ClickHouse server to version 22.7 or higher.
2. Alternatively, remove the ad hoc filter variable from your dashboard.
3. Use regular template variables as a workaround if upgrading is not possible.

---

## Failed to Get Table from Ad Hoc Query

**Error message:** "Failed to get table from adhoc query."

**Cause:** The plugin could not determine which table to apply ad hoc filters to from the query.

**Solution:**

1. Ensure your query contains a valid `FROM` clause with a table name.
2. If using a complex query with subqueries or CTEs, consider using a simpler query structure.
3. Explicitly specify the table in the ad hoc filter configuration variable.

---

## Invalid Ad Hoc Filter

**Error message:** "Invalid adhoc filter will be ignored: [filter details]"

**Cause:** An ad hoc filter is missing required fields (key, operator, or value).

**Solution:**

1. Verify that all ad hoc filters have a key (column name), operator, and value specified.
2. Check the filter configuration in your dashboard variables.
3. Remove any incomplete filter definitions.

---

## Log Context Errors

## Missing Query for Log Context

**Error message:** "Missing query for log context"

**Cause:** The log context feature was invoked without a valid query.

**Solution:**

1. Ensure you're using the log context feature with a valid logs query.
2. Verify that the query is using the Builder editor mode.

---

## Missing Log Context Options

**Error message:** "Missing log context options for query"

**Cause:** Required options for log context (direction or limit) are missing.

**Solution:**

1. This is typically an internal error. Try refreshing the page.
2. If the issue persists, report it as a bug.

---

## Log Context Only Works for Builder Queries

**Error message:** "Log context feature only works for builder queries"

**Cause:** The log context feature was invoked on a SQL editor query instead of a Builder query.

**Solution:**

1. Switch your query from **SQL Editor** mode to **Builder** mode.
2. Configure your logs query using the Builder interface.

---

## Missing Time Column for Log Context

**Error message:** "Missing time column for log context"

**Cause:** The query doesn't have a time column configured, which is required for log context.

**Solution:**

1. In the Query Builder, ensure you've selected a column with the **Time** hint.
2. Verify that your logs table has a timestamp column and it's properly configured.

---

## Unable to Match Log Context Columns

**Error message:** "Unable to match any log context columns"

**Cause:** None of the configured context columns could be matched from the current log row's data frame.

**Solution:**

1. Verify that the **Context Columns** are configured in the data source settings under Logs configuration.
2. Ensure the configured context column names match the actual column names in your query results.
3. Check that the context columns are included in your SELECT statement.

---

## Proxy Errors

## Unable to Cast SOCKS Proxy Dialer

**Error message:** "unable to cast SOCKS proxy dialer to context proxy dialer"

**Cause:** There was an issue initializing the secure SOCKS proxy connection for Private Data Connect (PDC).

**Solution:**

1. Verify your PDC configuration is correct.
2. Check that the SOCKS proxy is properly configured and accessible.
3. Review Grafana server logs for more detailed error information.
4. Ensure your Grafana version supports the PDC feature.

---

## Header Parsing Errors

## Couldn't Parse Message as Args

**Error message:** "Couldn't parse message as args"

**Cause:** The plugin could not parse the forwarded headers message.

**Solution:**

1. This is typically an internal error related to header forwarding.
2. Check if **Forward Grafana Headers** is enabled and configured correctly.
3. Review Grafana server logs for more details.

---

## Couldn't Parse Grafana HTTP Headers

**Error message:** "Couldn't parse grafana HTTP headers"

**Cause:** The Grafana HTTP headers could not be parsed from the request.

**Solution:**

1. Verify the header forwarding configuration.
2. Check that custom HTTP headers are properly formatted.
3. Review the data source configuration for any malformed header entries.

---

## Getting More Help

If you continue to experience issues after trying the solutions in this guide:

1. Check the [ClickHouse documentation](https://clickhouse.com/docs) for database-specific issues.
2. Review the Grafana server logs for more detailed error messages.
3. Search or create issues in the [grafana-clickhouse-datasource GitHub repository](https://github.com/grafana/clickhouse-datasource).
4. Visit the [Grafana Community forums](https://community.grafana.com/) for community support.
