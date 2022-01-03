# Guide to get Clickhouse running

## Add a directory where the database files will mount to from your docker container
mkdir $HOME/workspace/clickhouse/db/db

## run clickhouse - expose ports and add a volume to your folder above
docker run -d -p 8123:8123 -p 9000:9000 --name grafana-clickhouse-server --ulimit nofile=262144:262144 --volume=$HOME/workspace/clickhouse/db/db:/var/lib/clickhouse yandex/clickhouse-server

## clickhouse client (optional, if you want to query from the command line)
docker run -it --rm --link grafana-clickhouse-server:clickhouse-server yandex/clickhouse-client --host clickhouse-server

## Data loading - MGBench test data

### Timeseries data - Brown benchmark using docker clickhouse client
https://clickhouse.com/docs/en/getting-started/example-datasets/brown-benchmark/

### Download and unpack the csv files from the above link
### Create database and tables using commands from above link (can use a SQL Editor like DBeaver: https://dbeaver.io/)

### Load the tables from the downloaded csv files
sudo cat $HOME/workspace/clickhouse/mgbench/mgbench1.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs1 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench2.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs2 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench3.csv | docker run -i --rm --link grafana-clickhouse-server:clickhouse-server yandex/clickhouse-client -m --host clickhouse-server --query="INSERT INTO mgbench.logs3 FORMAT CSVWithNames"

## Connect from the Plugin (minimum requirements)
server address: localhost
server port: 9000

## With custom config
docker run -d -p 8443:8443 -p 9440:9440 --name secure-clickhouse-server --ulimit nofile=262144:262144 -v $PWD/config:/etc/clickhouse-server yandex/clickhouse-server

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
3. The Common/SAN name is "foo".  Add an entry to your hosts file on the host.
```
127.0.0.1  foo
```

### Now start the container using the config-secure settings

docker run -d -p 8443:8443 -p 9440:9440 -p 9000:9000 -p 8123:8123 --name secure-clickhouse-server --ulimit nofile=262144:262144 -v $PWD/config-secure:/etc/clickhouse-server yandex/clickhouse-server

### Login to the container and add the ca cert to trusted certs 
docker exec -it secure-clickhouse-server bash
cp /etc/clickhouse-server/my-own-ca.crt /usr/local/share/ca-certificates/root.ca.crt
update-ca-certificates

