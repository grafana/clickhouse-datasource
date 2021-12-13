# ClickHouse data source for Grafana

The ClickHouse data source plugin allows you to query and visualize ClickHouse data from within Grafana.

# Beta
This plugin is currently in Beta development and subject to change.
    
## Install the plugin

1. Navigate to [ClickHouse](https://grafana.com/grafana/plugins/clickhouse-datasource/) plugin homepage.
2. From the left-hand menu, click the **Install plugin** button.

   The **Installation** tab is displayed.

### Verify that the plugin is installed

1. In Grafana Enterprise from the left-hand menu, navigate to **Configuration** > **Data sources**.
2. From the top-right corner, click the **Add data source** button.
3. Search for ClickHouse in the search field, and hover over the ClickHouse search result.
4. Click the **Select** button for ClickHouse.
   * If you can click the **Select** button, then it is installed.
   * If the button is missing or disabled, then the plugin is not installed. Check to see if your Grafana Enterprise license is valid, and reinstall the plugin. If you still need help, [contact Grafana Labs](https://grafana.com/contact).

## Configure ClickHouse for the data source

Set up an ClickHouse user account with `readonly` permission and access to databases and tables you want to query. Grafana does not validate that queries are safe. Queries can contain any SQL statement. For example, statements like `ALTER TABLE system.users DELETE WHERE name='sadUser'` and `DROP TABLE sadTable;` would be executed.

## Configure the data source in Grafana

Follow [these instructions](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/) to add a new ClickHouse data source, and enter configuration options:


### Configure the data source with provisioning

It is possible to configure data sources using configuration files with Grafana’s provisioning system. To read about how it works, including and all the settings that you can set for this data source, refer to [Provisioning Grafana data sources](https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources).

Here are some provisioning examples for this data source using basic authentication:

```yaml
apiVersion: 1

datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    jsonData:
      defaultDatabase: database
      port: 9000
      server: localhost
      username: username
      tlsSkipVerify: false
    secureJsonData:
      password: password
```

## Query the data source

The query editor allows you to query ClickHouse to return time series or tabular data. Queries can contain macros which simplify syntax and allow for dynamic parts.

### Query as time series

Time series visualization options are selectable after adding a `datetime` field type to your query. This field will be used as the timestamp You can select time series visualizations using the visualization options. Grafana interprets timestamp rows without explicit time zone as UTC. Any column except time is treated as a value column.

### Query as table

Table visualizations will always be available for any valid ClickHouse query.


### Macros

To simplify syntax and to allow for dynamic parts, like date range filters, the query can contain macros.

Here is an example of a query with a macro that will use Grafana's time filter:
```sql
SELECT 
      date_time,
      data_stuff,
FROM test_data
WHERE $__timeFilter(date_time)
```

| Macro example | Description |
| -- | --|
| *$__timeFilter(dataRow)* | Will be replaced by a time range filter using the specified name. |
| *$__from* | Will be replaced by the start of the currently active time range filter selection. |
| *$__to* | Will be replaced by the end of the currently active time range filter selection. |
| *$__table* | Will be replaced by the table in use. |
| *$__column* | Will be replaced by the column in use. |

The plugin also supports notation using braces {}. Use this notation when queries are needed inside parameters.


### Templates and variables

To add a new ClickHouse query variable, refer to [Add a query variable](https://grafana.com/docs/grafana/latest/variables/variable-types/add-query-variable/). Use your ClickHouse data source as your data source for the following available queries:

After creating a variable, you can use it in your ClickHouse queries by using [Variable syntax](https://grafana.com/docs/grafana/latest/variables/syntax/). For more information about variables, refer to [Templates and variables](https://grafana.com/docs/grafana/latest/variables/).


### Import a dashboard for ClickHouse

Follow these [instructions](https://grafana.com/docs/grafana/latest/dashboards/export-import/#importing-a-dashboard) for importing a dashboard.

Imported dashboards can be found in Configuration > Data Sources > select your ClickHouse data source > select the Dashboards tab to see available pre-made dashboards.

## Learn more

* Add [Annotations](https://grafana.com/docs/grafana/latest/dashboards/annotations/).
* Configure and use [Templates and variables](https://grafana.com/docs/grafana/latest/variables/).
* Add [Transformations](https://grafana.com/docs/grafana/latest/panels/transformations/).
* Set up alerting; refer to [Alerts overview](https://grafana.com/docs/grafana/latest/alerting/).