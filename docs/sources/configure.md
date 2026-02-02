---
description: This document outlines configuration options for the ClickHouse data source
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: Configure the ClickHouse data source
title: ClickHouse data source
weight: 20
version: 0.1
---

## Configure the ClickHouse data source

This section explains how to safely configure a ClickHouse data source for use with Grafana, including recommended user permissions, supported connection protocols, and configuration options.

---

### ClickHouse user and permissions

Grafana executes queries **exactly as written** and does not attempt to validate or restrict SQL statements. For this reason, we strongly recommend using a **read-only ClickHouse user** for Grafana.

A read-only user helps prevent accidental or destructive operations, such as modifying or deleting tables, while still allowing dashboards and queries to function normally.

#### Recommended permissions

Create a ClickHouse user with:

- `readonly` permissions enabled
- Access limited to the databases and tables you intend to query
- Permission to modify the `max_execution_time` setting

> ⚠️ Grafana does not prevent execution of non-read queries.  
> If a user has sufficient privileges, queries such as `DROP TABLE` or `ALTER TABLE` will be executed by ClickHouse.

---

#### Configuring a read-only user

To configure a suitable read-only user:

1. Create a user or profile following the  
   [Creating Users and Roles in ClickHouse](https://clickhouse.com/docs/en/operations/access-rights) documentation.
2. Set `readonly = 1` for the user or profile.
3. Allow modification of the `max_execution_time` setting, which is required by the underlying  
   [`clickhouse-go`](https://github.com/ClickHouse/clickhouse-go/) client.

If you are using a **public ClickHouse instance**, do **not** set `readonly = 2`. Instead:

- Keep `readonly = 1`
- Set the constraint type for `max_execution_time` to  
  [`changeable_in_readonly`](https://clickhouse.com/docs/en/operations/settings/constraints-on-settings)

This provides the necessary flexibility without granting write access.

---

### ClickHouse protocol support

The data source supports two transport protocols:

- **Native** (default)
- **HTTP**

Both protocols use ClickHouse’s optimized native data formats and support the same query capabilities.

#### Default ports

Each protocol uses different default ports, depending on whether TLS is enabled:

| Protocol | TLS | Port |
| -------- | --- | ---- |
| HTTP     | No  | 8123 |
| HTTP     | Yes | 8443 |
| Native   | No  | 9000 |
| Native   | Yes | 9440 |

When enabling **Secure Connection (TLS)** in Grafana, ensure that the selected port supports TLS. Grafana does not automatically change ports when TLS is enabled.

---

### Configure via the Grafana UI

After installing the ClickHouse plugin, add a new data source in Grafana by following  
[Add a data source](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/).

In the configuration screen:

1. Enter the ClickHouse server address
2. Select the protocol (Native or HTTP)
3. Set the appropriate port
4. Enable **Secure Connection** if TLS is required
5. Provide the ClickHouse username and password
6. Click **Save & test** to verify the connection

---

### Configure via provisioning files

Grafana also supports configuring data sources using provisioning files. This is useful for automated or repeatable setups.

For an overview, see  
[Provisioning Grafana data sources](https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources).

Below is an example ClickHouse data source configuration using basic authentication:

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
