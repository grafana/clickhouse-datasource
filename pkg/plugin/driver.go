package plugin

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/clickhouse-datasource/pkg/macros"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds/v2"
	"github.com/pkg/errors"
	"strconv"
	"time"
)

// Clickhouse defines how to connect to a Clickhouse datasource
type Clickhouse struct{}

// getTLSConfig returns tlsConfig from settings
// logic reused from https://github.com/grafana/grafana/blob/615c153b3a2e4d80cff263e67424af6edb992211/pkg/models/datasource_cache.go#L211
func getTLSConfig(settings Settings) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: settings.InsecureSkipVerify,
		ServerName:         settings.Server,
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
	t, err := strconv.Atoi(settings.Timeout)
	if err != nil {
		return nil, errors.New(fmt.Sprintf("invalid timeout: %s", settings.Timeout))
	}

	db := clickhouse.OpenDB(&clickhouse.Options{
		TLS:  tlsConfig,
		Addr: []string{fmt.Sprintf("%s:%d", settings.Server, settings.Port)},
		Auth: clickhouse.Auth{
			Username: settings.Username,
			Password: settings.Password,
			Database: settings.DefaultDatabase,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		DialTimeout: time.Duration(t) * time.Second,
		Settings: clickhouse.Settings{
			"allow_experimental_object_type": 1,
			"flatten_nested":                 0,
		},
		ReadTimeout: time.Duration(t) * time.Second,
	})

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
		"fromTime":      macros.FromTimeFilter,
		"toTime":        macros.ToTimeFilter,
		"timeFilter_ms": macros.TimeFilterMs,
		"timeFilter":    macros.TimeFilter,
		"timeInterval":  macros.TimeInterval,
		"interval_s":    macros.IntervalSeconds,
	}
}

func (h *Clickhouse) Settings(backend.DataSourceInstanceSettings) sqlds.DriverSettings {
	return sqlds.DriverSettings{
		Timeout: time.Second * 30,
		FillMode: &data.FillMissing{
			Mode: data.FillModeNull,
		},
	}
}
