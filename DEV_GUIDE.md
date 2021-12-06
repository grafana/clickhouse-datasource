# Guide to get Clickhouse running

## Add a directory where the database files will mount to from your docker container
mkdir $HOME/workspace/clickhouse/db/db

## run clickhouse - expose ports and add a volume to your folder above
docker run -d -p 8123:8123 -p 9000:9000 --name grafana-clickhouse-server --ulimit nofile=262144:262144 --volume=$HOME/workspace/clickhouse/db/db:/var/lib/clickhouse yandex/clickhouse-server

## clickhouse client (optional, if you want to query from the command line)
docker run -it --rm --link some-clickhouse-server:clickhouse-server yandex/clickhouse-client --host clickhouse-server

## Data loading - MGBench test data

### Timeseries data - Brown benchmark using docker clickhouse client
https://clickhouse.com/docs/en/getting-started/example-datasets/brown-benchmark/

### Download and unpack the csv files from the above link
### Create database and tables using commands from above link (can use a SQL Editor like DBeaver: https://dbeaver.io/)

### Load the tables from the downloaded csv files
sudo cat $HOME/workspace/clickhouse/mgbench/mgbench1.csv | docker run -i --rm --link some-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs1 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench2.csv | docker run -i --rm --link some-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs2 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench3.csv | docker run -i --rm --link some-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs3 FORMAT CSVWithNames"

## Connect from the Plugin (minimum requirements)
server address: localhost
server port: 9000