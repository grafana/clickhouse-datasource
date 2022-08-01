package plugin_test

import (
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	clickhouse_sql "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-units"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/clickhouse-datasource/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"math/big"
	"os"
	"path"
	"reflect"
	"strings"
	"testing"
	"time"
)

const defaultClickHouseVersion = "latest"

func GetClickHouseTestVersion() string {
	return GetEnv("CLICKHOUSE_VERSION", defaultClickHouseVersion)
}

func GetEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func TestMain(m *testing.M) {
	useDocker := strings.ToLower(getEnv("CLICKHOUSE_USE_DOCKER", "true"))
	if useDocker == "false" {
		fmt.Printf("Using external ClickHouse for IT tests -  %s:%s\n",
			getEnv("CLICKHOUSE_PORT", "9000"), getEnv("CLICKHOUSE_HOST", "localhost"))
		os.Exit(m.Run())
	}
	// create a ClickHouse container
	ctx := context.Background()
	// attempt use docker for CI
	provider, err := testcontainers.ProviderDocker.GetProvider()
	if err != nil {
		fmt.Printf("Docker is not running and no clickhouse connections details were provided. Skipping IT tests: %s\n", err)
		os.Exit(0)
	}
	err = provider.Health(ctx)
	if err != nil {
		fmt.Printf("Docker is not running and no clickhouse connections details were provided. Skipping IT tests: %s\n", err)
		os.Exit(0)
	}
	chVersion := GetClickHouseTestVersion()
	fmt.Printf("Using Docker for IT tests with ClickHouse %s\n", chVersion)
	cwd, err := os.Getwd()
	if err != nil {
		// can't test without container
		panic(err)
	}
	req := testcontainers.ContainerRequest{
		Image:        fmt.Sprintf("clickhouse/clickhouse-server:%s", chVersion),
		ExposedPorts: []string{"9000/tcp", "8123/tcp"},
		WaitingFor:   wait.ForLog("Ready for connections"),
		Mounts: []testcontainers.ContainerMount{
			testcontainers.BindMount(path.Join(cwd, "../../config/custom.xml"), "/etc/clickhouse-server/config.d/custom.xml"),
			testcontainers.BindMount(path.Join(cwd, "../../config/admin.xml"), "/etc/clickhouse-server/users.d/admin.xml"),
		},
		Resources: container.Resources{
			Ulimits: []*units.Ulimit{
				{
					Name: "nofile",
					Hard: 262144,
					Soft: 262144,
				},
			},
		},
	}
	clickhouseContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		// can't test without container
		panic(err)
	}
	p, _ := clickhouseContainer.MappedPort(ctx, "9000")
	os.Setenv("CLICKHOUSE_PORT", p.Port())
	hp, _ := clickhouseContainer.MappedPort(ctx, "8123")
	os.Setenv("CLICKHOUSE_HTTP_PORT", hp.Port())
	os.Setenv("CLICKHOUSE_HOST", "localhost")
	defer clickhouseContainer.Terminate(ctx) //nolint
	os.Exit(m.Run())
}

func TestConnect(t *testing.T) {
	port := getEnv("CLICKHOUSE_PORT", "9000")
	host := getEnv("CLICKHOUSE_HOST", "localhost")
	username := getEnv("CLICKHOUSE_USERNAME", "default")
	password := getEnv("CLICKHOUSE_PASSWORD", "")
	ssl := getEnv("CLICKHOUSE_SSL", "false")
	clickhouse := plugin.Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		secure := map[string]string{}
		secure["password"] = password
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(fmt.Sprintf(`{ "server": "%s", "port": %s, "username": "%s", "secure": %s }`, host, port, username, ssl)), DecryptedSecureJSONData: secure}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

func TestHTTPConnect(t *testing.T) {
	port := getEnv("CLICKHOUSE_HTTP_PORT", "8123")
	host := getEnv("CLICKHOUSE_HOST", "localhost")
	username := getEnv("CLICKHOUSE_USERNAME", "default")
	password := getEnv("CLICKHOUSE_PASSWORD", "")
	ssl := getEnv("CLICKHOUSE_SSL", "false")
	clickhouse := plugin.Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		secure := map[string]string{}
		secure["password"] = password
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(fmt.Sprintf(`{ "server": "%s", "port": %s, "username": "%s", "secure": %s, "protocol": "http" }`, host, port, username, ssl)), DecryptedSecureJSONData: secure}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func setupConnection(t *testing.T, protocol clickhouse_sql.Protocol) *sql.DB {
	port := getEnv("CLICKHOUSE_PORT", "9000")
	if protocol == clickhouse_sql.HTTP {
		port = getEnv("CLICKHOUSE_HTTP_PORT", "8123")
	}
	host := getEnv("CLICKHOUSE_HOST", "localhost")
	username := getEnv("CLICKHOUSE_USERNAME", "default")
	password := getEnv("CLICKHOUSE_PASSWORD", "")
	ssl, ok := os.LookupEnv("CLICKHOUSE_SSL")
	var sConfig *tls.Config
	if ok && strings.ToLower(ssl) == "true" {
		sConfig = &tls.Config{
			InsecureSkipVerify: false,
		}
	}
	// we create a direct connection since we need specific settings for insert
	conn := clickhouse_sql.OpenDB(&clickhouse_sql.Options{
		Addr: []string{fmt.Sprintf("%s:%s", host, port)},
		Settings: clickhouse_sql.Settings{
			"allow_experimental_object_type": 1,
			"flatten_nested":                 0,
		},
		Auth: clickhouse_sql.Auth{
			Database: "default",
			Username: username,
			Password: password,
		},
		TLS:      sConfig,
		Protocol: protocol,
	})
	return conn
}

func setupTest(t *testing.T, ddl string, protocol clickhouse_sql.Protocol) (*sql.DB, func(t *testing.T)) {
	conn := setupConnection(t, protocol)
	_, err := conn.Exec("DROP TABLE IF EXISTS simple_table")
	require.NoError(t, err)
	_, err = conn.Exec(fmt.Sprintf("CREATE table simple_table(%s) ENGINE = MergeTree ORDER BY tuple();", ddl))
	require.NoError(t, err)
	return conn, func(t *testing.T) {
		_, err := conn.Exec("DROP TABLE simple_table")
		require.NoError(t, err)
	}
}

func insertData(t *testing.T, conn *sql.DB, data ...interface{}) {
	scope, err := conn.Begin()
	require.NoError(t, err)
	batch, err := scope.Prepare("INSERT INTO simple_table")
	require.NoError(t, err)
	for _, val := range data {
		_, err = batch.Exec(val)
		require.NoError(t, err)
	}
	require.NoError(t, scope.Commit())
}

func toJson(obj interface{}) string {
	bytes, err := json.Marshal(obj)
	if err != nil {
		return "unable to marshal"
	}
	return string(bytes)
}

func checkFieldValue(t *testing.T, field *data.Field, expected ...interface{}) {
	for i, eVal := range expected {
		val := field.At(i)
		if eVal == nil {
			assert.Nil(t, val)
			return
		}
		switch tVal := eVal.(type) {
		case float64:
			assert.InDelta(t, tVal, val, 0.01)
		default:
			switch reflect.ValueOf(eVal).Kind() {
			case reflect.Map, reflect.Slice:
				assert.JSONEq(t, toJson(tVal), *val.(*string))
				return
			}
			assert.Equal(t, eVal, val)
		}
	}
}

var Protocols = map[string]clickhouse_sql.Protocol{"native": clickhouse_sql.Native, "http": clickhouse_sql.HTTP}

func checkRows(t *testing.T, conn *sql.DB, rowLimit int64, expectedValues ...interface{}) {
	rows, err := conn.Query(fmt.Sprintf("SELECT * FROM simple_table LIMIT %d", rowLimit))
	require.NoError(t, err)
	frame, err := sqlutil.FrameFromRows(rows, rowLimit, converters.ClickhouseConverters...)
	require.NoError(t, err)
	assert.Equal(t, 1, len(frame.Fields))
	checkFieldValue(t, frame.Fields[0], expectedValues...)
}

func TestConvertUInt8(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt8", protocol)
			defer close(t)
			insertData(t, conn, uint8(1))
			checkRows(t, conn, 1, uint8(1))
		})
	}

}

func TestConvertUInt16(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt16", protocol)
			defer close(t)
			insertData(t, conn, uint16(2))
			checkRows(t, conn, 1, uint16(2))
		})
	}
}

func TestConvertUInt32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt32", protocol)
			defer close(t)
			insertData(t, conn, uint32(3))
			checkRows(t, conn, 1, uint32(3))
		})
	}
}

func TestConvertUInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt64", protocol)
			defer close(t)
			insertData(t, conn, uint64(4))
			checkRows(t, conn, 1, uint64(4))
		})
	}
}

func TestConvertNullableUInt8(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt8)", protocol)
			defer close(t)
			val := uint8(5)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableUInt16(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt16)", protocol)
			defer close(t)
			val := uint16(6)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableUInt32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt16)", protocol)
			defer close(t)
			val := uint16(7)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableUInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt16)", protocol)
			defer close(t)
			val := uint16(8)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableInt8(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int8)", protocol)
			defer close(t)
			val := int8(9)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableInt16(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int16)", protocol)
			defer close(t)
			val := int16(10)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableInt32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int32)", protocol)
			defer close(t)
			val := int32(11)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int64)", protocol)
			defer close(t)
			val := int64(12)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertInt8(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int8", protocol)
			defer close(t)
			val := int8(13)
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestConvertInt16(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int16", protocol)
			defer close(t)
			insertData(t, conn, int16(14))
			checkRows(t, conn, 1, int16(14))
		})
	}
}

func TestConvertInt32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int32", protocol)
			defer close(t)
			insertData(t, conn, int32(15))
			checkRows(t, conn, 1, int32(15))
		})
	}
}

func TestConvertInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int64", protocol)
			defer close(t)
			insertData(t, conn, int64(16))
			checkRows(t, conn, 1, int64(16))
		})
	}
}

func TestConvertFloat32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Float32", protocol)
			defer close(t)
			insertData(t, conn, float32(17.1))
			checkRows(t, conn, 1, float32(17.1))
		})
	}
}

func TestConvertFloat64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Float64", protocol)
			defer close(t)
			insertData(t, conn, float64(18.1))
			checkRows(t, conn, 1, float64(18.1))
		})
	}
}

func TestConvertNullableFloat32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Float32)", protocol)
			defer close(t)
			val := float32(19.1)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertNullableFloat64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Float64)", protocol)
			defer close(t)
			val := float64(20.1)
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertBool(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Bool", protocol)
			defer close(t)
			insertData(t, conn, true)
			checkRows(t, conn, 1, true)
		})
	}
}

func TestConvertNullableBool(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Bool)", protocol)
			defer close(t)
			val := true
			insertData(t, conn, val, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertInt128(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int128", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(23))
			checkRows(t, conn, 1, float64(23))
		})
	}
}

func TestConvertNullableInt128(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int128)", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(24), nil)
			val := float64(24)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Int256", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(25))
			checkRows(t, conn, 1, float64(25))
		})
	}
}

func TestConvertNullableInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Int256)", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(26), nil)
			val := float64(26)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertUInt128(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt128", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(27))
			checkRows(t, conn, 1, float64(27))
		})
	}
}

func TestConvertNullableUInt128(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt128)", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(28), nil)
			val := float64(28)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertUInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UInt256", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(29))
			checkRows(t, conn, 1, float64(29))
		})
	}
}

func TestConvertNullableUInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UInt256)", protocol)
			defer close(t)
			insertData(t, conn, big.NewInt(30), nil)
			val := float64(30)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

var date, _ = time.Parse("2006-01-02", "2022-01-12")

func TestConvertDate(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Date", protocol)
			defer close(t)
			insertData(t, conn, date)
			checkRows(t, conn, 1, date)
		})
	}
}

func TestConvertNullableDate(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Date)", protocol)
			defer close(t)
			insertData(t, conn, date, nil)
			checkRows(t, conn, 2, &date, nil)
		})
	}
}

var datetime, _ = time.Parse("2006-01-02 15:04:05", "2022-01-12 00:00:00")

func TestConvertDateTime(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			var localtime time.Time
			switch name {
			// currently native will set a columns tz - http won't as info isn't sent - see https://github.com/ClickHouse/ClickHouse/issues/38209
			case "native":
				loc, _ := time.LoadLocation("Europe/London")
				localtime = datetime.In(loc)
			case "http":
				localtime = datetime.Local()
			}
			conn, close := setupTest(t, "col1 DateTime('Europe/London')", protocol)
			defer close(t)
			insertData(t, conn, localtime)
			checkRows(t, conn, 1, localtime)
		})
	}
}

func TestConvertNullableDateTime(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			loc, _ := time.LoadLocation("Europe/London")
			conn, close := setupTest(t, "col1 Nullable(DateTime('Europe/London'))", protocol)
			defer close(t)
			locTime := datetime.In(loc)
			insertData(t, conn, locTime, nil)
			checkRows(t, conn, 2, &locTime, nil)
		})
	}
}

func TestConvertDateTime64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			loc, _ := time.LoadLocation("Europe/London")
			conn, close := setupTest(t, "col1 DateTime64(3, 'Europe/London')", protocol)
			defer close(t)
			locTime := datetime.In(loc)
			locTime.Add(123 * time.Millisecond)
			insertData(t, conn, locTime)
			checkRows(t, conn, 1, locTime)
		})
	}
}

func TestConvertNullableDateTime64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			loc, _ := time.LoadLocation("Europe/London")
			conn, close := setupTest(t, "col1 Nullable(DateTime64(3, 'Europe/London'))", protocol)
			defer close(t)
			locTime := datetime.In(loc)
			locTime.Add(123 * time.Millisecond)
			insertData(t, conn, locTime, nil)
			checkRows(t, conn, 2, &locTime, nil)
		})
	}
}

func TestConvertString(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 String", protocol)
			defer close(t)
			insertData(t, conn, "37")
			checkRows(t, conn, 1, "37")
		})
	}
}

func TestConvertNullableString(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(String)", protocol)
			defer close(t)
			insertData(t, conn, "38", nil)
			val := "38"
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestConvertDecimal(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Decimal(15,3)", protocol)
			defer close(t)
			insertData(t, conn, decimal.New(39, 10))
			val, _ := decimal.New(39, 10).Float64()
			checkRows(t, conn, 1, val)
		})
	}
}

func TestConvertNullableDecimal(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(Decimal(15,3))", protocol)
			defer close(t)
			insertData(t, conn, decimal.New(40, 10), nil)
			val, _ := decimal.New(40, 10).Float64()
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestTuple(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Tuple(s String, i Int64)", protocol)
			defer close(t)
			val := map[string]interface{}{"s": "41", "i": int64(41)}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestNested(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nested(s String, i Int64)", protocol)
			defer close(t)
			val := []map[string]interface{}{{"s": "42", "i": int64(42)}}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestArrayTuple(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Array(Tuple(s String, i Int32))", protocol)
			defer close(t)
			val := []map[string]interface{}{{"s": "43", "i": int32(43)}}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestArrayInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Array(Int64)", protocol)
			defer close(t)
			val := []int64{int64(45), int64(45)}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestArrayNullableInt64(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Array(Nullable(Int64))", protocol)
			defer close(t)
			v := int64(45)
			val := []*int64{&v, nil}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestArrayUInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Array(UInt256)", protocol)
			defer close(t)
			val := []*big.Int{big.NewInt(47), big.NewInt(47)}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestArrayNullableUInt256(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Array(Nullable(UInt256))", protocol)
			defer close(t)
			val := []*big.Int{big.NewInt(47), nil}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestMap(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Map(String, UInt8)", protocol)
			defer close(t)
			val := map[string]uint8{"49": uint8(49)}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestFixedString(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 FixedString(2)", protocol)
			defer close(t)
			val := "51"
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestNullableFixedString(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(FixedString(2))", protocol)
			defer close(t)
			val := "52"
			insertData(t, conn, val)
			insertData(t, conn, nil)
			checkRows(t, conn, 2, &val, nil)
		})
	}
}

func TestLowCardinalityString(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 LowCardinality(String)", protocol)
			defer close(t)
			val := "53"
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}

func TestConvertDate32(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Date32", protocol)
			defer close(t)
			insertData(t, conn, date)
			checkRows(t, conn, 1, date)
		})
	}
}

func TestConvertEnum(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Enum('55' = 55)", protocol)
			defer close(t)
			insertData(t, conn, "55")
			checkRows(t, conn, 1, "55")
		})
	}
}

func TestConvertUUID(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 UUID", protocol)
			defer close(t)
			val := "417ddc5d-e556-4d27-95dd-a34d84e46a50"
			insertData(t, conn, val)
			checkRows(t, conn, 1, &val)
		})
	}
}

func TestConvertNullableUUID(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn, close := setupTest(t, "col1 Nullable(UUID)", protocol)
			defer close(t)
			val := "417ddc5d-e556-4d27-95dd-a34d84e46a50"
			insertData(t, conn, val)
			checkRows(t, conn, 1, &val)
		})
	}
}

func TestConvertJSON(t *testing.T) {
	for name, protocol := range Protocols {
		t.Run(fmt.Sprintf("using %s", name), func(t *testing.T) {
			conn := setupConnection(t, clickhouse_sql.Native)
			canTest, err := plugin.CheckMinServerVersion(conn, 22, 6, 1)
			if err != nil {
				t.Skip(err.Error())
				return
			}
			if !canTest {
				t.Skipf("Skipping JSON test as version is < 22.6.1")
				return
			}
			conn, close := setupTest(t, "col1 JSON", protocol)
			defer close(t)
			val := map[string]interface{}{
				"test": map[string][]string{
					"test": {"2", "3"},
				},
			}
			insertData(t, conn, val)
			checkRows(t, conn, 1, val)
		})
	}
}
