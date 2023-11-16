package plugin

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/clickhouse-datasource/pkg/macros"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	sdkproxy "github.com/grafana/grafana-plugin-sdk-go/backend/proxy"
	"github.com/grafana/grafana-plugin-sdk-go/build"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds/v2"
	"github.com/pkg/errors"
	"golang.org/x/net/proxy"
)

// Clickhouse defines how to connect to a Clickhouse datasource
type Clickhouse struct{}

// getTLSConfig returns tlsConfig from settings
// logic reused from https://github.com/grafana/grafana/blob/615c153b3a2e4d80cff263e67424af6edb992211/pkg/models/datasource_cache.go#L211
func getTLSConfig(settings Settings) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: settings.InsecureSkipVerify,
		ServerName:         settings.Host,
	}
	if settings.TlsClientAuth || settings.TlsAuthWithCACert {
		if settings.TlsAuthWithCACert && len(settings.TlsCACert) > 0 {
			caPool := x509.NewCertPool()
			if ok := caPool.AppendCertsFromPEM([]byte(settings.TlsCACert)); !ok {
				return nil, ErrorInvalidCACertificate
			}
			tlsConfig.RootCAs = caPool
		}
		if settings.TlsClientAuth {
			cert, err := tls.X509KeyPair([]byte(settings.TlsClientCert), []byte(settings.TlsClientKey))
			if err != nil {
				return nil, err
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}
	}
	return tlsConfig, nil
}

func getClientInfoProducts() (products []struct{ Name, Version string }) {
	if version := os.Getenv("GF_VERSION"); version != "" {
		products = append(products, struct{ Name, Version string }{
			Name:    "grafana",
			Version: version,
		})
	}

	if info, err := build.GetBuildInfo(); err == nil {
		products = append(products, struct{ Name, Version string }{
			Name:    "clickhouse-datasource",
			Version: info.Version,
		})
	}

	return products
}

func CheckMinServerVersion(conn *sql.DB, major, minor, patch uint64) (bool, error) {
	var version struct {
		Major uint64
		Minor uint64
		Patch uint64
	}
	var res string
	if err := conn.QueryRow("SELECT version()").Scan(&res); err != nil {
		return false, err
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
		return false, nil
	}
	return true, nil
}

// Connect opens a sql.DB connection using datasource settings
func (h *Clickhouse) Connect(config backend.DataSourceInstanceSettings, message json.RawMessage) (*sql.DB, error) {
	settings, err := LoadSettings(config)
	if err != nil {
		return nil, err
	}
	var tlsConfig *tls.Config
	if settings.TlsAuthWithCACert || settings.TlsClientAuth {
		tlsConfig, err = getTLSConfig(settings)
		if err != nil {
			return nil, err
		}
	} else if settings.Secure {
		tlsConfig = &tls.Config{
			InsecureSkipVerify: settings.InsecureSkipVerify,
		}
	}
	t, err := strconv.Atoi(settings.DialTimeout)
	if err != nil {
		return nil, errors.New(fmt.Sprintf("invalid timeout: %s", settings.DialTimeout))
	}
	qt, err := strconv.Atoi(settings.QueryTimeout)
	if err != nil {
		return nil, errors.New(fmt.Sprintf("invalid query timeout: %s", settings.QueryTimeout))
	}
	protocol := clickhouse.Native
	if settings.Protocol == "http" {
		protocol = clickhouse.HTTP
	}
	compression := clickhouse.CompressionLZ4
	if protocol == clickhouse.HTTP {
		compression = clickhouse.CompressionGZIP
	}
	customSettings := make(clickhouse.Settings)
	if settings.CustomSettings != nil {
		for _, setting := range settings.CustomSettings {
			customSettings[setting.Setting] = setting.Value
		}
	}

	opts := &clickhouse.Options{
		ClientInfo: clickhouse.ClientInfo{
			Products: getClientInfoProducts(),
		},
		TLS:         tlsConfig,
		Addr:        []string{fmt.Sprintf("%s:%d", settings.Host, settings.Port)},
		HttpUrlPath: settings.Path,
		Auth: clickhouse.Auth{
			Username: settings.Username,
			Password: settings.Password,
			Database: settings.DefaultDatabase,
		},
		Compression: &clickhouse.Compression{
			Method: compression,
		},
		DialTimeout: time.Duration(t) * time.Second,
		ReadTimeout: time.Duration(qt) * time.Second,
		Protocol:    protocol,
		Settings:    customSettings,
	}

	p := sdkproxy.New(settings.ProxyOptions)

	if p.SecureSocksProxyEnabled() {
		dialer, err := p.NewSecureSocksProxyContextDialer()
		if err != nil {
			return nil, err
		}
		contextDialer, ok := dialer.(proxy.ContextDialer)
		if !ok {
			return nil, errors.New("unable to cast socks proxy dialer to context proxy dialer")
		}
		opts.DialContext = func(ctx context.Context, addr string) (net.Conn, error) {
			return contextDialer.DialContext(ctx, "tcp", addr)
		}
	}

	db := clickhouse.OpenDB(opts)

	timeout := time.Duration(t)
	ctx, cancel := context.WithTimeout(context.Background(), timeout*time.Second)
	defer cancel()

	chErr := make(chan error, 1)
	go func() {
		err = db.PingContext(ctx)
		chErr <- err
	}()

	select {
	case err := <-chErr:
		if err != nil {
			// sql ds will ping again and show error
			if exception, ok := err.(*clickhouse.Exception); ok {
				log.DefaultLogger.Error("[%d] %s \n%s\n", exception.Code, exception.Message, exception.StackTrace)
			} else {
				log.DefaultLogger.Error(err.Error())
			}
			return db, nil
		}
	case <-time.After(timeout * time.Second):
		return db, errors.New("connection timed out")
	}

	return db, settings.isValid()
}

// Converters defines list of data type converters
func (h *Clickhouse) Converters() []sqlutil.Converter {
	return converters.ClickhouseConverters
}

// Macros returns list of macro functions convert the macros of raw query
func (h *Clickhouse) Macros() sqlds.Macros {
	return map[string]sqlds.MacroFunc{
		"fromTime":        macros.FromTimeFilter,
		"toTime":          macros.ToTimeFilter,
		"timeFilter_ms":   macros.TimeFilterMs,
		"timeFilter":      macros.TimeFilter,
		"dateFilter":      macros.DateFilter,
		"timeInterval_ms": macros.TimeIntervalMs,
		"timeInterval":    macros.TimeInterval,
		"interval_s":      macros.IntervalSeconds,
	}
}

func (h *Clickhouse) Settings(config backend.DataSourceInstanceSettings) sqlds.DriverSettings {
	settings, err := LoadSettings(config)
	timeout := 60
	if err == nil {
		t, err := strconv.Atoi(settings.QueryTimeout)
		if err == nil {
			timeout = t
		}
	}
	return sqlds.DriverSettings{
		Timeout: time.Second * time.Duration(timeout),
		FillMode: &data.FillMissing{
			Mode: data.FillModeNull,
		},
	}
}

func (h *Clickhouse) MutateQuery(ctx context.Context, req backend.DataQuery) (context.Context, backend.DataQuery) {
	var dataQuery struct {
		Meta struct {
			TimeZone string `json:"timezone"`
		} `json:"meta"`
		Format int `json:"format"`
	}

	if err := json.Unmarshal(req.JSON, &dataQuery); err != nil {
		return ctx, req
	}

	if dataQuery.Meta.TimeZone == "" {
		return ctx, req
	}

	loc, _ := time.LoadLocation(dataQuery.Meta.TimeZone)
	return clickhouse.Context(ctx, clickhouse.WithUserLocation(loc)), req
}

// MutateResponse For any view other than traces we convert FieldTypeNullableJSON to string
func (h *Clickhouse) MutateResponse(ctx context.Context, res data.Frames) (data.Frames, error) {
	for _, frame := range res {
		if frame.Meta.PreferredVisualization != data.VisTypeTrace &&
			frame.Meta.PreferredVisualization != data.VisTypeTable {
			var fields []*data.Field
			for _, field := range frame.Fields {
				values := make([]*string, field.Len())
				if field.Type() == data.FieldTypeNullableJSON {
					newField := data.NewField(field.Name, field.Labels, values)
					newField.SetConfig(field.Config)
					for i := 0; i < field.Len(); i++ {
						val := field.At(i).(*json.RawMessage)
						if val == nil {
							newField.Set(i, nil)
						} else {
							bytes, err := val.MarshalJSON()
							if err != nil {
								return res, err
							}
							sVal := string(bytes)
							newField.Set(i, &sVal)
						}
					}
					fields = append(fields, newField)
				} else {
					fields = append(fields, field)
				}
			}
			frame.Fields = fields
		}
	}
	return res, nil
}
