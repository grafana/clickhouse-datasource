package plugin

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"

	"github.com/ClickHouse/clickhouse-go"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/clickhouse-datasource/pkg/macros"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds"
)

// Clickhouse defines how to connect to a Clickhouse datasource
type Clickhouse struct{}

// FillMode defines how to fill null values
func (h *Clickhouse) FillMode() *data.FillMissing {
	return &data.FillMissing{
		Mode: data.FillModeNull,
	}
}

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
func (h *Clickhouse) Connect(config backend.DataSourceInstanceSettings) (*sql.DB, error) {
	settings, err := LoadSettings(config)
	if err != nil {
		return nil, err
	}
	connStr := fmt.Sprintf("tcp://%s:%d", settings.Server, settings.Port)
	sep := "?"
	if settings.Username != "" {
		connStr = fmt.Sprintf("%s%susername=%s", connStr, sep, settings.Username)
		sep = "&"
	}
	if settings.Password != "" {
		connStr = fmt.Sprintf("%s%spassword=%s", connStr, sep, settings.Password)
		sep = "&"
	}
	if settings.DefaultDatabase != "" {
		connStr = fmt.Sprintf("%s%sdatabase=%s", connStr, sep, settings.DefaultDatabase)
		sep = "&"
	}
	if settings.InsecureSkipVerify {
		connStr = fmt.Sprintf("%s%sskip_verify=%s", connStr, sep, "true")
		sep = "&"
	}
	if settings.Secure {
		connStr = fmt.Sprintf("%s%ssecure=%s", connStr, sep, "true")
		sep = "&"
	}
	if settings.TlsAuthWithCACert || settings.TlsClientAuth {
		tlsConfig, err := getTLSConfig(settings)
		if err != nil {
			return nil, err
		}
		err = clickhouse.RegisterTLSConfig(config.UID, tlsConfig)
		if err != nil {
			return nil, err
		}
		connStr = fmt.Sprintf("%s%stls_config=%s", connStr, sep, config.UID)
	}

	db, err := sql.Open("clickhouse", connStr)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		if exception, ok := err.(*clickhouse.Exception); ok {
			log.DefaultLogger.Error("[%d] %s \n%s\n", exception.Code, exception.Message, exception.StackTrace)
		} else {
			log.DefaultLogger.Error(err.Error())
		}
		// TODO - if we return the error here, the message is not displayed - check sdk
		return db, nil
	}
	return db, settings.isValid()
}

// Converters defines list of data type converters
func (h *Clickhouse) Converters() []sqlutil.Converter {
	return converters.CLICKHOUSE_CONVERTERS
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
