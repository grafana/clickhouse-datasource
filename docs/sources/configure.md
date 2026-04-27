---
description: Configure the ClickHouse data source for Grafana, including connection, TLS, logs, traces, and provisioning
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
menuTitle: Configure
title: Configure the ClickHouse data source
weight: 20
version: 0.1
last_reviewed: 2026-04-24
---

# Configure the ClickHouse data source

This page explains how to configure the ClickHouse data source, including connection settings, TLS, logs and traces column mappings, and provisioning.

## Before you begin

Before configuring the data source, ensure you have:

- **Grafana permissions:** Organization administrator role.
- **Plugin:** The ClickHouse data source plugin installed. For Grafana version compatibility, see [Requirements](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/#requirements).
- **ClickHouse:** A running ClickHouse server and a user with read-only access (or the permissions described below).
- **Network access:** The Grafana server can reach the ClickHouse server on the intended port (HTTP: 8123 or 8443 with TLS; Native: 9000 or 9440 with TLS).

{{< admonition type="note" >}}
**Grafana Cloud users:** If your ClickHouse server is behind a firewall, you must allowlist the Grafana Cloud outbound IP addresses so that queries can reach your database. For the current list of IPs, refer to [Allow Grafana Cloud outbound traffic](https://grafana.com/docs/grafana-cloud/account-management/allow-traffic/).

The published list covers standard outbound IPs but may not include every address used by your specific Grafana Cloud stack. If connections are still blocked after allowlisting the documented IPs, check your firewall or ClickHouse server logs for the rejected source addresses and [open a support ticket](https://grafana.com/profile/org#support) so the Grafana team can confirm the full set of IPs for your stack.
{{< /admonition >}}

## ClickHouse user and permissions

Grafana executes queries exactly as written and does not validate or restrict SQL. Use a **read-only ClickHouse user** for this data source to avoid accidental or destructive operations (such as modifying or deleting tables) while still allowing dashboards and queries to run.

If your ClickHouse administrator has already given you a read-only user and connection details, you can skip to [Add the data source](#add-the-data-source).

### Recommended permissions

Create a ClickHouse user with:

- **readonly** permission enabled
- Access limited to the databases and tables you intend to query
- Permission to modify the **max_execution_time** setting (required by the plugin’s client)

{{< admonition type="warning" >}}
Grafana does not prevent execution of non-read queries. If the ClickHouse user has sufficient privileges, statements such as `DROP TABLE` or `ALTER TABLE` will be executed by ClickHouse.
{{< /admonition >}}

### Configure a read-only user

To configure a suitable read-only user:

1. Create a user or profile using [Creating users and roles in ClickHouse](https://clickhouse.com/docs/en/operations/access-rights).
1. Set `readonly = 1` for the user or profile. For details, see [Permissions for queries (readonly)](https://clickhouse.com/docs/en/operations/settings/permissions-for-queries#readonly).
1. Allow modification of the **max_execution_time** setting, which is required by the [clickhouse-go](https://github.com/ClickHouse/clickhouse-go/) client so the plugin can enforce query timeouts.

#### Required SETTINGS permissions

The plugin's underlying client ([clickhouse-go](https://github.com/ClickHouse/clickhouse-go/)) sets certain ClickHouse `SETTINGS` on each query. If the ClickHouse user does not have permission to modify these settings, queries will fail at runtime even though the **Save & test** check may pass.

At a minimum the user must be allowed to change the following settings:

| Setting | Why the plugin needs it |
|---------|------------------------|
| **max_execution_time** | Enforces the query timeout configured in the data source. |

When `readonly = 1` is set, ClickHouse blocks all setting changes by default. To allow the required settings without disabling read-only mode:

1. Create a [settings profile or constraint](https://clickhouse.com/docs/en/operations/settings/constraints-on-settings) for the Grafana user.
1. Set the constraint type for each required setting to **changeable_in_readonly**.

Example (SQL):

```sql
-- Allow the grafana_reader profile to modify max_execution_time while remaining read-only
ALTER SETTINGS PROFILE grafana_reader
  SETTINGS readonly = 1,
  SETTINGS max_execution_time CHANGEABLE_IN_READONLY;
```

If you see errors such as `DB::Exception: Cannot modify 'max_execution_time': Setting is locked` at query time, the user is missing this permission. Refer to [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) for more details.

{{< admonition type="note" >}}
If you use a **public ClickHouse instance**, do not set `readonly = 2`. Keep `readonly = 1` and use the `changeable_in_readonly` constraint described above.
{{< /admonition >}}

## ClickHouse protocol support

The data source supports two transport protocols: **Native** (default) and **HTTP**. Both support the same query capabilities. The Native protocol uses ClickHouse's binary TCP interface for better performance. HTTP uses the ClickHouse HTTP interface, which is useful when your network requires HTTP-based connectivity (for example, through a reverse proxy or load balancer).

### Default ports

| Protocol | TLS  | Port |
|----------|------|------|
| HTTP     | No   | 8123 |
| HTTP     | Yes  | 8443 |
| Native   | No   | 9000 |
| Native   | Yes  | 9440 |

When you enable **Secure connection** in Grafana, you must also set the port to a TLS-enabled port. Grafana does not change the port automatically when TLS is toggled on.

## Add the data source

To add the data source:

1. Click **Connections** in the left-side menu.
1. Click **Add new connection**.
1. Type **ClickHouse** in the search bar.
1. Select **ClickHouse**.
1. Click **Add new data source**.

## Configure settings

After adding the data source, configure the following settings.

### Server settings

| Setting | Description |
|---------|-------------|
| **Name** | The name used to refer to the data source in panels and queries. |
| **Default** | Toggle to make this the default data source for new panels. |
| **Server** | The ClickHouse server host (for example, `localhost`). |
| **Protocol** | **Native** or **HTTP**. |
| **Port** | Port number; depends on protocol and whether TLS is enabled (see default ports above). |
| **Secure connection** | Enable when your ClickHouse server uses TLS. When enabled, update the **Port** to a TLS-enabled port and configure [TLS settings](#tls-settings) below. |
| **Username** | ClickHouse user name. Use a [read-only user](#clickhouse-user-and-permissions). |
| **Password** | ClickHouse user password. |
| **Default database** | The database the query builder uses when no database is selected. If left blank, the plugin defaults to `default`. |
| **Default table** | The default table used by the query builder. |

### Default database guidance

The **Default database** setting controls which database the query builder and ad hoc filters use when no database is explicitly specified.

- **Self-hosted ClickHouse:** Set this to the database you query most often so that the query builder pre-selects it.
- **ClickHouse Cloud:** Leave this field **blank**. ClickHouse Cloud connections already route to the correct default database for your service. Setting an explicit value can cause `Unknown database` errors if the name does not match the service's configured database.

If you are unsure which database to use, leave the field blank and select a database per query in the query builder.

### HTTP settings

The following settings appear only when **Protocol** is set to **HTTP**:

| Setting | Description |
|---------|-------------|
| **HTTP URL Path** | Additional URL path appended to HTTP requests (for example, `/clickhouse`). Defaults to `/`. |
| **Custom HTTP headers** | Static headers sent with every request. Each header has a name, value, and an optional **Secure** toggle that stores the value in encrypted storage. |
| **Forward Grafana HTTP headers** | When enabled, forwards Grafana request headers (such as authentication headers) to ClickHouse. Enables multi-connection mode so each unique set of forwarded headers gets its own connection. |

### TLS settings

When **Secure connection** is enabled, the following TLS settings become available:

| Setting | Description |
|---------|-------------|
| **Skip TLS Verify** | Skip server certificate verification. Use only for testing; not recommended for production. |
| **TLS Client Auth** | Enable mutual TLS (mTLS) by providing a client certificate and key. |
| **With CA Cert** | Provide a custom CA certificate for verifying the ClickHouse server's TLS certificate (required for self-signed certificates). |
| **CA Cert** | PEM-encoded CA certificate. |
| **Client Cert** | PEM-encoded client certificate (required when TLS Client Auth is enabled). |
| **Client Key** | PEM-encoded client private key (required when TLS Client Auth is enabled). |

### Additional settings

| Setting | Description |
|---------|-------------|
| **Dial Timeout** | Timeout in seconds for establishing a connection. Default: `10`. |
| **Query Timeout** | Timeout in seconds for read queries. Default: `60`. |
| **Validate SQL** | When enabled, validates SQL syntax in the query editor. |
| **Enable row limit** | When enabled, applies the Grafana row limit setting to query results. |

### Custom ClickHouse settings

You can pass arbitrary ClickHouse `SETTINGS` with every query by adding key-value pairs in the **Custom Settings** section. For example, you can set `max_block_size` or `max_threads` to tune query performance.

These settings are appended to each query's `SETTINGS` clause. They do not replace any settings that the plugin sets internally (such as `max_execution_time`).

### Logs configuration

The data source includes a dedicated configuration section for log queries. These settings control the default column mappings used by the [logs query builder](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/#logs-query-builder):

| Setting | Description |
|---------|-------------|
| **Default log database** | The default database for log queries. |
| **Default log table** | The default table for log queries. |
| **Use OTel** | When enabled, pre-fills column mappings for [OpenTelemetry ClickHouse exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter) tables. Select the OTel schema version that matches your exporter. |
| **Time column** | The high-precision timestamp column for sorting log rows. |
| **Filter Time column** | A lower-precision time column for fast partition-based filtering. |
| **Log Level column** | The column containing the log severity level. |
| **Log Message column** | The column containing the log message body. |
| **Context columns** | Comma-separated list of columns included alongside log messages for additional context. |

### Traces configuration

The data source includes a dedicated configuration section for trace queries. These settings control the default column mappings used by the [traces query builder](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/#traces-query-builder):

| Setting | Description |
|---------|-------------|
| **Default trace database** | The default database for trace queries. |
| **Default trace table** | The default table for trace queries. |
| **Use OTel** | When enabled, pre-fills column mappings for OpenTelemetry tables. Select the OTel schema version that matches your exporter. |
| **Duration unit** | The unit for the duration column (`seconds`, `milliseconds`, `microseconds`, or `nanoseconds`). |
| **Flatten nested** | Enable if your traces table was created with `flatten_nested=1`. |

When **Use OTel** is disabled, you can manually configure columns for Trace ID, Span ID, Parent Span ID, Service Name, Operation Name, Start Time, Duration, Tags, Service Tags, Kind, Status Code, Status Message, State, and Instrumentation Library.

### Private data source connect

{{< admonition type="note" >}}
Only available for Grafana Cloud users.
{{< /admonition >}}

Private data source connect (PDC) allows you to establish a private, secured connection between a Grafana Cloud instance (or stack) and data sources secured within a private network. Select the drop-down to locate the URL for PDC. For more information, refer to [Private data source connect](https://grafana.com/docs/grafana-cloud/connect-externally-hosted/private-data-source-connect/).

Click **Manage private data source connect** to go to your PDC connection page, where you can find your PDC configuration details.

## Verify the connection

Once you have configured your ClickHouse connection settings, click **Save & test** to verify the connection. When the connection test succeeds, you see **Data source is working**. A successful test confirms that Grafana can reach ClickHouse and that the credentials are valid.

If the test fails, refer to [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) for common configuration errors and solutions.

## Provision the data source

You can define the data source in YAML files as part of the Grafana provisioning system. For more information, refer to [Provisioning Grafana data sources](https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources).

Example ClickHouse data source configuration with basic authentication:

```yaml
apiVersion: 1
datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    jsonData:
      host: localhost
      port: 9000
      protocol: native
      username: grafana_reader
      # defaultDatabase: <string>
      # defaultTable: <string>
      # secure: <bool>
      # tlsSkipVerify: <bool>
      # tlsAuth: <bool>
      # tlsAuthWithCACert: <bool>
      # dialTimeout: <seconds>
      # queryTimeout: <seconds>
      # validateSql: <bool>
      # enableRowLimit: <bool>
      # forwardGrafanaHeaders: <bool>
      # path: <string>  # HTTP URL path (HTTP protocol only)
      # httpHeaders:     # HTTP protocol only
      #   - name: X-Example-Header
      #     secure: false
      #     value: <string>
      # customSettings:
      #   - setting: max_block_size
      #     value: "65505"
    secureJsonData:
      password: password
      # tlsCACert: <string>
      # tlsClientCert: <string>
      # tlsClientKey: <string>
```

## Provision with Terraform

You can provision the ClickHouse data source using the [Grafana Terraform provider](https://registry.terraform.io/providers/grafana/grafana/latest/docs). Example with basic authentication:

```hcl
resource "grafana_data_source" "clickhouse" {
  type = "grafana-clickhouse-datasource"
  name = "ClickHouse"

  json_data_encoded = jsonencode({
    host             = "localhost"
    port             = 9000
    protocol         = "native"
    username         = "grafana_reader"
    tlsSkipVerify    = false
    # defaultDatabase = "mydb"
    # dialTimeout     = "10"
    # queryTimeout    = "60"
    # validateSql     = true
    # enableRowLimit  = true
  })

  secure_json_data_encoded = jsonencode({
    password = var.clickhouse_password
  })
}
```

For more options and authentication methods, refer to the [Grafana Terraform provider documentation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/data_source).

## Next steps

After configuring the data source:

- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Build queries with the SQL editor or query builder.
- [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/) — Use variables in dashboards and queries.
- [ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/) — Overview, supported features, and pre-built dashboards.
