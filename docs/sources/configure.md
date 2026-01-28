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

### ClickHouse user for the data source

Set up an ClickHouse user account with [readonly](https://clickhouse.com/docs/en/operations/settings/permissions-for-queries#settings_readonly) permission and access to
databases and tables you want to query.
Please note that Grafana does not validate that queries are safe. Queries can contain any SQL statement.
For example, statements like `ALTER TABLE system.users DELETE WHERE name='sadUser'`
and `DROP TABLE sadTable;` would be executed.

To configure a readonly user, follow these steps:

1. Create a `readonly` user profile following the [Creating Users and Roles in ClickHouse](https://clickhouse.com/docs/en/operations/access-rights) guide.
2. Ensure the `readonly` user has enough permission to modify the `max_execution_time` setting required by the underlying [clickhouse-go client](https://github.com/ClickHouse/clickhouse-go/).
3. If you're using a public ClickHouse instance, it's not recommended to set `readonly=2` in the `readonly` profile. Instead, leave `readonly=1` and set the constraint type of `max_execution_time` to [changeable_in_readonly](https://clickhouse.com/docs/en/operations/settings/constraints-on-settings) to allow modification of this setting.

### ClickHouse protocol support

The plugin supports both `Native` (default) and `HTTP` transport protocols.
This can be enabled in the configuration via the `protocol` configuration parameter.
Both protocols exchange data with ClickHouse using optimized native format.

Note that the default ports for `HTTP/S` and `Native` differ:

- HTTP - 8123
- HTTPS - 8443
- Native - 9000
- Native with TLS - 9440

### Manual configuration via UI

Once the plugin is installed on your Grafana instance, follow
[these instructions](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/)
to add a new ClickHouse data source, and enter configuration options.

### With a configuration file

It is possible to configure data sources using configuration files with Grafana’s provisioning system.
To read about how it works, refer to
[Provisioning Grafana data sources](https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources).

Here are some provisioning examples for this data source using basic authentication:

```yaml
apiVersion: 1
datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    jsonData:
      defaultDatabase: database
      port: 9000
      host: localhost
      username: username
      tlsSkipVerify: false
      # tlsAuth: <bool>
      # tlsAuthWithCACert: <bool>
      # secure: <bool>
      # dialTimeout: <seconds>
      # queryTimeout: <seconds>
      # protocol: <native|http>
      # defaultTable: <string>
      # httpHeaders:
      # - name: X-Example-Header
      #   secure: false
      #   value: <string>
      # - name: Authorization
      #   secure: true
      # logs:
      #   defaultDatabase: <string>
      #   defaultTable: <string>
      #   otelEnabled: <bool>
      #   otelVersion: <string>
      #   timeColumn: <string>
      #   ...Column: <string>
      # traces:
      #   defaultDatabase: <string>
      #   defaultTable: <string>
      #   otelEnabled: <bool>
      #   otelVersion: <string>
      #   durationUnit: <seconds|milliseconds|microseconds|nanoseconds>
      #   traceIdColumn: <string>
      #   ...Column: <string>
    secureJsonData:
      password: password
      # tlsCACert: <string>
      # tlsClientCert: <string>
      # tlsClientKey: <string>
      # secureHttpHeaders.Authorization: <string>
```
