package plugin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"math/big"
	"os"
	"path"
	"strconv"
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

func checkMinServerVersion(conn *sql.DB, major, minor, patch uint64) error {
	var version struct {
		Major uint64
		Minor uint64
		Patch uint64
	}
	var res string
	if err := conn.QueryRow("SELECT version()").Scan(&res); err != nil {
		panic(err)
	}
	for i, v := range strings.Split(res, ".") {
		switch i {
		case 0:
			version.Major, _ = strconv.ParseUint(v, 10, 64)
		case 1:
			version.Minor, _ = strconv.ParseUint(v, 10, 64)
		case 2:
			version.Patch, _ = strconv.ParseUint(v, 10, 64)
		}
	}
	if version.Major < major || (version.Major == major && version.Minor < minor) || (version.Major == major && version.Minor == minor && version.Patch < patch) {
		return fmt.Errorf("unsupported server version %d.%d.%d < %d.%d.%d", version.Major, version.Minor, version.Patch, major, minor, patch)
	}
	return nil
}

func TestMain(m *testing.M) {
	// create a ClickHouse container
	ctx := context.Background()
	cwd, err := os.Getwd()
	if err != nil {
		// can't test without container
		panic(err)
	}
	req := testcontainers.ContainerRequest{
		Image:        fmt.Sprintf("clickhouse/clickhouse-server:%s", GetClickHouseTestVersion()),
		ExposedPorts: []string{"9000/tcp"},
		WaitingFor:   wait.ForLog("Ready for connections"),
		Mounts: []testcontainers.ContainerMount{
			testcontainers.BindMount(path.Join(cwd, "../../config/custom.xml"), "/etc/clickhouse-server/config.d/custom.xml"),
			testcontainers.BindMount(path.Join(cwd, "../../config/admin.xml"), "/etc/clickhouse-server/users.d/admin.xml"),
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

	os.Setenv("CLICKHOUSE_DB_PORT", p.Port())
	defer clickhouseContainer.Terminate(ctx) //nolint
	os.Exit(m.Run())
}

func TestConnect(t *testing.T) {
	port := os.Getenv("CLICKHOUSE_DB_PORT")
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(fmt.Sprintf(`{ "server": "localhost", "port": %s }`, port)), DecryptedSecureJSONData: map[string]string{}}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

func TestConnectSecure(t *testing.T) {
	// TODO: Configure and test over SSL
	t.Skip()
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		params := `{ "server": "server", "port": 9440, "username": "foo", "secure": true }`
		secure := map[string]string{}
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(params), DecryptedSecureJSONData: secure}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

//if err := checkMinServerVersion(conn, 22, 6, 1); err != nil {
//// n
//t.Skip(err.Error())
//return
//}

func setupConnection(t *testing.T) *sql.DB {
	clickhouse := Clickhouse{}
	port := os.Getenv("CLICKHOUSE_DB_PORT")
	settings := backend.DataSourceInstanceSettings{JSONData: []byte(fmt.Sprintf(`{ "server": "localhost", "port": %s }`, port)), DecryptedSecureJSONData: map[string]string{}}
	conn, err := clickhouse.Connect(settings, json.RawMessage{})
	require.NoError(t, err)
	return conn
}

func setupTest(t *testing.T, ddl string) (*sql.DB, func(t *testing.T)) {
	conn := setupConnection(t)
	conn.Exec("DROP TABLE simple_table")
	_, err := conn.Exec(fmt.Sprintf("CREATE table simple_table(%s) ENGINE = MergeTree ORDER BY tuple();", ddl))
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
			assert.Equal(t, eVal, val)
		}

	}
}

func checkRows(t *testing.T, conn *sql.DB, rowLimit int64, expectedValues ...interface{}) {
	rows, err := conn.Query(fmt.Sprintf("SELECT * FROM simple_table LIMIT %d", rowLimit))
	require.NoError(t, err)
	frame, err := sqlutil.FrameFromRows(rows, rowLimit, converters.ClickhouseConverters...)
	require.NoError(t, err)
	assert.Equal(t, 1, len(frame.Fields))
	checkFieldValue(t, frame.Fields[0], expectedValues...)
}

func TestConvertUInt8(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt8")
	defer close(t)
	insertData(t, conn, uint8(1))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, uint8(1))
}

func TestConvertUInt16(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt16")
	defer close(t)
	insertData(t, conn, uint16(2))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, uint16(2))
}

func TestConvertUInt32(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt32")
	defer close(t)
	insertData(t, conn, uint32(3))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, uint32(3))
}

func TestConvertUInt64(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt64")
	defer close(t)
	insertData(t, conn, uint64(4))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, uint64(4))
}

func TestConvertNullableUInt8(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt8)")
	defer close(t)
	val := uint8(5)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableUInt16(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt16)")
	defer close(t)
	val := uint16(6)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableUInt32(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt16)")
	defer close(t)
	val := uint16(7)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableUInt64(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt16)")
	defer close(t)
	val := uint16(8)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableInt8(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int8)")
	defer close(t)
	val := int8(9)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableInt16(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int16)")
	defer close(t)
	val := int16(10)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableInt32(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int32)")
	defer close(t)
	val := int32(11)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableInt64(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int64)")
	defer close(t)
	val := int64(12)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertInt8(t *testing.T) {
	conn, close := setupTest(t, "col1 Int8")
	defer close(t)
	val := int8(13)
	insertData(t, conn, val)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, val)
}

func TestConvertInt16(t *testing.T) {
	conn, close := setupTest(t, "col1 Int16")
	defer close(t)
	insertData(t, conn, int16(14))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, int16(14))
}

func TestConvertInt32(t *testing.T) {
	conn, close := setupTest(t, "col1 Int32")
	defer close(t)
	insertData(t, conn, int32(15))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, int32(15))
}

func TestConvertInt64(t *testing.T) {
	conn, close := setupTest(t, "col1 Int64")
	defer close(t)
	insertData(t, conn, int64(16))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, int64(16))
}

func TestConvertFloat32(t *testing.T) {
	conn, close := setupTest(t, "col1 Float32")
	defer close(t)
	insertData(t, conn, float32(17.1))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float32(17.1))
}

func TestConvertFloat64(t *testing.T) {
	conn, close := setupTest(t, "col1 Float64")
	defer close(t)
	insertData(t, conn, float64(18.1))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float64(18.1))
}

func TestConvertNullableFloat32(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Float32)")
	defer close(t)
	val := float32(19.1)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertNullableFloat64(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Float64)")
	defer close(t)
	val := float64(20.1)
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertBool(t *testing.T) {
	conn, close := setupTest(t, "col1 Bool")
	defer close(t)
	insertData(t, conn, true)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, true)
}

func TestConvertNullableBool(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Bool)")
	defer close(t)
	val := true
	insertData(t, conn, val, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertInt128(t *testing.T) {
	conn, close := setupTest(t, "col1 Int128")
	defer close(t)
	insertData(t, conn, big.NewInt(23))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float64(23))
}

func TestConvertNullableInt128(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int128)")
	defer close(t)
	insertData(t, conn, big.NewInt(24), nil)
	// we test the frame marshalling logic with our converters
	val := float64(24)
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertInt256(t *testing.T) {
	conn, close := setupTest(t, "col1 Int256")
	defer close(t)
	insertData(t, conn, big.NewInt(25))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float64(25))
}

func TestConvertNullableInt256(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Int256)")
	defer close(t)
	insertData(t, conn, big.NewInt(26), nil)
	// we test the frame marshalling logic with our converters
	val := float64(26)
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertUInt128(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt128")
	defer close(t)
	insertData(t, conn, big.NewInt(27))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float64(27))
}

func TestConvertNullableUInt128(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt128)")
	defer close(t)
	insertData(t, conn, big.NewInt(28), nil)
	val := float64(28)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

func TestConvertUInt256(t *testing.T) {
	conn, close := setupTest(t, "col1 UInt256")
	defer close(t)
	insertData(t, conn, big.NewInt(29))
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, float64(29))
}

func TestConvertNullableUInt256(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(UInt256)")
	defer close(t)
	insertData(t, conn, big.NewInt(30), nil)
	val := float64(30)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &val, nil)
}

var date, _ = time.Parse("2006-01-02", "2022-01-12")

func TestConvertDate(t *testing.T) {
	conn, close := setupTest(t, "col1 Date")
	defer close(t)
	insertData(t, conn, date)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, date)
}

func TestConvertNullableDate(t *testing.T) {
	conn, close := setupTest(t, "col1 Nullable(Date)")
	defer close(t)
	insertData(t, conn, date, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &date, nil)
}

var datetime, _ = time.Parse("2006-01-02 15:04:05", "2022-01-12 00:00:00")

func TestConvertDateTime(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/London")
	conn, close := setupTest(t, "col1 DateTime('Europe/London')")
	defer close(t)
	locTime := datetime.In(loc)
	insertData(t, conn, locTime)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 1, locTime)
}

func TestConvertNullableDateTime(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/London")
	conn, close := setupTest(t, "col1 Nullable(DateTime('Europe/London'))")
	defer close(t)
	locTime := datetime.In(loc)
	insertData(t, conn, locTime, nil)
	// we test the frame marshalling logic with our converters
	checkRows(t, conn, 2, &locTime, nil)
}

//                        col33 DateTime,
//                        col34 Nullable(DateTime),
//                        col35 DateTime64(3),
//                        col36 Nullable(DateTime64(3)),
//                        col37 String,
//                        col38 Nullable(String),
//                        col39 Decimal(15,3),
//                        col40 Nullable(Decimal(15,3)),
//                        col41 Tuple(s String, i Int64),
//                        col42 Nested(s String, i Int64),
//						col43 Array(Tuple(s String, i Int32)),
//                        col44 Array(Nested(s String, i Int32)),
//                        col45 Array(Int64),
//                        col46 Array(Nullable(Int64)),
//                        col47 Array(UInt256),
//                        col48 Array(Nullable(UInt256)),
//                        col49 Map(String, UInt8),
//                        col50 Tuple(String, Int32),
//                        col51 FixedString(2),
//                        col52 Nullable(FixedString(2)),
//                        col53 LowCardinality(String),
//                        col54 Date32,
//                        col55 Enum('55' = 55),
//                        col56 UUID,
//                        col57 Nullable(UUID),
//                        col58 JSON
//                         ) ENGINE = MergeTree ORDER BY tuple();
//		`
//		date, _ := time.Parse("2006-01-02", "2022-01-12")
//		datetime, _ := time.Parse("2006-01-02 15:04:05", "2022-01-12 00:00:00")
//		var (
//			col31Data = date
//			col32Data = col31Data.Add(24 * time.Hour)
//			col33Data = datetime.Truncate(time.Second).Add(24 * time.Hour)
//			col34Data = col33Data.Add(24 * time.Hour)
//			col35Data = datetime.Add(123 * time.Millisecond)
//			col36Data = col35Data.Add(24 * time.Hour)
//			col37Data = "37"
//			col38Data = "38"
//			col39Data = decimal.New(39, 123)
//			col40Data = decimal.New(40, 123)
//			col41Data = map[string]interface{}{"s": "41", "i": int64(41)}
//			col42Data = []map[string]interface{}{{"s": "42", "i": int64(41)}}
//			col43Data = []map[string]interface{}{{"s": "43", "i": int32(43)}}
//			col44Data = [][]map[string]interface{}{{{"s": "44", "i": int32(44)}}}
//			col45Data = []int64{int64(45), int64(45)}
//			col46Data = []int64{int64(45), int64(45)}
//			col47Data = []*big.Int{big.NewInt(47), big.NewInt(47)}
//			col48Data = []*big.Int{big.NewInt(48), big.NewInt(48)}
//			col49Data = map[string]uint8{"49": uint8(49)}
//			col50Data = []interface{}{"50", int32(50)}
//			col51Data = "51"
//			col52Data = "52"
//			col53Data = "53"
//			col54Data = date
//			col55Data = "55"
//			col56Data = "417ddc5d-e556-4d27-95dd-a34d84e46a50"
//			col57Data = "417ddc5d-e556-4d27-95dd-a34d84e46a50"
//			col58Data = map[string]interface{}{
//				"test": map[string][]string{
//					"test": {"2", "3"},
//				},
//			}
