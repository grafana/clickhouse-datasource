---
description: This document outlines configuration options for the ClickHouse data source
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
menuTitle: Configure the ClickHouse data source
title: Configure the ClickHouse data source
weight: 20
version: 0.1
last_reviewed: 2026-02-11
---

# Configure the ClickHouse data source

This document explains how to configure the ClickHouse data source.

## Before you begin

Before configuring the data source, ensure you have:

- **Grafana permissions:** Organization administrator role.
- **Plugin:** The ClickHouse data source plugin installed. For Grafana version compatibility, see [Requirements](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/#requirements).
- **ClickHouse:** A running ClickHouse server and a user with read-only access (or the permissions described below).
- **Network access:** The Grafana server can reach the ClickHouse server on the intended port (HTTP: 8123 or 8443 with TLS; Native: 9000 or 9440 with TLS).

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

If you use a **public ClickHouse instance**, do not set `readonly = 2`. Instead:

- Keep `readonly = 1`
- Set the constraint type for **max_execution_time** to [changeable_in_readonly](https://clickhouse.com/docs/en/operations/settings/constraints-on-settings)

## ClickHouse protocol support

The data source supports two transport protocols: **Native** (default) and **HTTP**. Both use ClickHouse’s optimized native data formats and support the same query capabilities.

### Default ports

| Protocol | TLS  | Port |
|----------|------|------|
| HTTP     | No   | 8123 |
| HTTP     | Yes  | 8443 |
| Native   | No   | 9000 |
| Native   | Yes  | 9440 |

When you enable **Secure connection (TLS)** in Grafana, use a port that supports TLS. Grafana does not change the port automatically when TLS is enabled.

## Add the data source

To add the data source:

1. Click **Connections** in the left-side menu.
1. Click **Add new connection**.
1. Type **ClickHouse** in the search bar.
1. Select **ClickHouse**.
1. Click **Add new data source**.

## Configure settings

After adding the data source, configure the following:

| Setting | Description |
|---------|-------------|
| **Name** | The name used to refer to the data source in panels and queries. |
| **Default** | Toggle to make this the default data source for new panels. |
| **Server** | The ClickHouse server host (for example, `localhost`). |
| **Protocol** | **Native** or **HTTP**. |
| **Port** | Port number; depends on protocol and whether TLS is enabled (see default ports above). |
| **Secure connection** | Enable when your ClickHouse server uses TLS. |
| **Username** | ClickHouse user name. |
| **Password** | ClickHouse user password. |

## Verify the connection

Click **Save & test** to verify the connection. When the connection test succeeds, you see **Data source is working**. A successful test confirms that Grafana can reach ClickHouse and that the credentials are valid.

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
      defaultDatabase: database
      tlsSkipVerify: false
      # secure: <bool>
      # tlsAuth: <bool>
      # tlsAuthWithCACert: <bool>
      # dialTimeout: <seconds>
      # queryTimeout: <seconds>
      # defaultTable: <string>
      # httpHeaders:
      #   - name: X-Example-Header
      #     secure: false
      #     value: <string>
    secureJsonData:
      username: username
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

  json_data = {
    defaultDatabase = "default"
    port             = 9000
    host             = "localhost"
    protocol         = "native"
    tlsSkipVerify    = false
  }

  secure_json_data = {
    password = var.clickhouse_password
  }
}
```

For more options and authentication methods, refer to the [Grafana Terraform provider documentation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/data_source).

## Next steps

After configuring the data source:

- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Build queries with the SQL editor or query builder.
- [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/) — Use variables in dashboards and queries.
- [ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/) — Overview, supported features, and pre-built dashboards.
