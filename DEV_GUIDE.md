# Guide to get Clickhouse running

## Add a directory where the database files will mount to from your docker container

mkdir $HOME/workspace/clickhouse/db/db

## run clickhouse - expose ports and add a volume to your folder above

docker run -d -p 8123:8123 -p 9000:9000 --name grafana-clickhouse-server --ulimit nofile=262144:262144 --volume=$HOME/workspace/clickhouse/db/db:/var/lib/clickhouse clickhouse/clickhouse-server

## clickhouse client (optional, if you want to query from the command line)

docker run -it --rm --link grafana-clickhouse-server:clickhouse-server clickhouse/clickhouse-client --host clickhouse-server

## Data loading - MGBench test data

### Timeseries data - Brown benchmark using docker clickhouse client

https://clickhouse.com/docs/en/getting-started/example-datasets/brown-benchmark/

### Download and unpack the csv files from the above link

### Create database and tables using commands from above link (can use a SQL Editor like DBeaver: https://dbeaver.io/)

### Load the tables from the downloaded csv files

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench1.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server clickhouse/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs1 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench2.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server clickhouse/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs2 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench3.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server clickhouse/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs3 FORMAT CSVWithNames"

## Connect from the Plugin (minimum requirements)

server address: localhost
server port: 9000

## With custom config

docker run -d -p 8443:8443 -p 9440:9440 --name secure-clickhouse-server --ulimit nofile=262144:262144 -v $PWD/config:/etc/clickhouse-server clickhouse/clickhouse-server

## With secure config - for testing TLS scenarios

### First setup the certificates

1. Create the CA cert

```
./scripts/ca.sh
```

2. Create the Server cert from the CA

```
./scripts/ca-cert.sh
```

3. The Common/SAN name is "foo". Add an entry to your hosts file on the host.

```
127.0.0.1  foo
```

### Now start the container using the config-secure settings

docker run -d -p 8443:8443 -p 9440:9440 -p 9000:9000 -p 8123:8123 --name secure-clickhouse-server --ulimit nofile=262144:262144 -v $PWD/config-secure:/etc/clickhouse-server clickhouse/clickhouse-server

### Login to the container and add the ca cert to trusted certs

docker exec -it secure-clickhouse-server bash
cp /etc/clickhouse-server/my-own-ca.crt /usr/local/share/ca-certificates/root.ca.crt
update-ca-certificates

# Code Structure / Notes

## Column Hints

Column hints are used within the query builder and SQL generator to enable flexible and dynamic queries.

Here's an example of some column hints:
```js
ColumnHint.Time
ColumnHint.LogMessage
ColumnHint.LogLevel
ColumnHint.TraceId
```

The easiest example is the time hint (`ColumnHint.Time`). When building a Logs query, we need to know what the primary log time column is:

```ts
const logTimeColumn: SelectedColumn = { name: 'my_time_column_on_my_table', hint: ColumnHint.Time, alias: 'logTime' };
```

Using the column hint, we can add an `ORDER BY` statement to the query without having to know the actual column name:

```ts
const logsOrderBy: OrderBy = { name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC };
```

Notice how `name` can be left empty, this is because the SQL generator knows to find the final column/alias by the time hint:

```ts
// Input options
const queryBuilderOptions: QueryBuilderOptions = {
  table: 'logs',
  columns: [logTimeColumn],
  orderBy: [logsOrderBy],
  . . .
};
```
```sql
-- Final output from SQL generator
SELECT my_time_column_on_my_table as logTime FROM logs ORDER BY logTime ASC
```

By adding a simple hint, we can apply filters, orderBys, and other behaviors to the SQL generator without having to reference specific columns. This simplifies the UI logic and user experience by reducing the number of places where a column name needs to be updated.
