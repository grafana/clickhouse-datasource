package plugin

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/clickhouse-datasource/pkg/converters"
	"github.com/grafana/clickhouse-datasource/pkg/macros"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	sdkproxy "github.com/grafana/grafana-plugin-sdk-go/backend/proxy"
	"github.com/grafana/grafana-plugin-sdk-go/build/buildinfo"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/errorsource"
	"github.com/grafana/sqlds/v5"
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
				return nil, backend.DownstreamError(ErrorInvalidCACertificate)
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

// getPDCDialContext returns a dialer function for creating a connection to PDC if a secure SOCKS proxy is enabled.
func getPDCDialContext(settings Settings) (func(context.Context, string) (net.Conn, error), error) {
	p := sdkproxy.New(settings.ProxyOptions)

	if !p.SecureSocksProxyEnabled() {
		return nil, nil
	}

	dialer, err := p.NewSecureSocksProxyContextDialer()
	if err != nil {
		return nil, err
	}

	contextDialer, ok := dialer.(proxy.ContextDialer)
	if !ok {
		return nil, errors.New("unable to cast SOCKS proxy dialer to context proxy dialer")
	}

	return func(ctx context.Context, addr string) (net.Conn, error) {
		return contextDialer.DialContext(ctx, "tcp", addr)
	}, nil
}

func getClientInfoProducts(ctx context.Context) (products []struct{ Name, Version string }) {
	version := backend.UserAgentFromContext(ctx).GrafanaVersion()

	if version != "" {
		products = append(products, struct{ Name, Version string }{
			Name:    "grafana",
			Version: version,
		})
	}

	if info, err := buildinfo.GetBuildInfo(); err == nil {
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
func (h *Clickhouse) Connect(ctx context.Context, config backend.DataSourceInstanceSettings, message json.RawMessage) (*sql.DB, error) {
	settings, err := LoadSettings(ctx, config)
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
		return nil, backend.DownstreamError(errors.New(fmt.Sprintf("invalid timeout: %s", settings.DialTimeout)))
	}
	qt, err := strconv.Atoi(settings.QueryTimeout)
	if err != nil {
		return nil, backend.DownstreamError(errors.New(fmt.Sprintf("invalid query timeout: %s", settings.QueryTimeout)))
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

	if settings.RowLimit != 0 && settings.EnableRowLimit {
		customSettings["limit"] = settings.RowLimit
	}

	httpHeaders, err := extractForwardedHeadersFromMessage(message)
	if err != nil {
		return nil, err
	}

	// merge settings.HttpHeaders with message httpHeaders
	for k, v := range settings.HttpHeaders {
		httpHeaders[k] = v
	}

	opts := &clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%d", settings.Host, settings.Port)},
		Auth: clickhouse.Auth{
			Database: settings.DefaultDatabase,
			Password: settings.Password,
			Username: settings.Username,
		},
		ClientInfo: clickhouse.ClientInfo{
			Products: getClientInfoProducts(ctx),
		},
		Compression: &clickhouse.Compression{
			Method: compression,
		},
		DialTimeout: time.Duration(t) * time.Second,
		HttpHeaders: httpHeaders,
		HttpUrlPath: settings.Path,
		Protocol:    protocol,
		ReadTimeout: time.Duration(qt) * time.Second,
		Settings:    customSettings,
		TLS:         tlsConfig,
	}

	// dialCtx is used to create a connection to PDC, if it is enabled
	dialCtx, err := getPDCDialContext(settings)
	if err != nil {
		return nil, err
	}
	if dialCtx != nil {
		opts.DialContext = dialCtx
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(t)*time.Second)
	defer cancel()

	db := clickhouse.OpenDB(opts)

	// Set connection pool settings
	if i, err := strconv.Atoi(settings.ConnMaxLifetime); err == nil {
		db.SetConnMaxLifetime(time.Duration(i) * time.Minute)
	}
	if i, err := strconv.Atoi(settings.MaxIdleConns); err == nil {
		db.SetMaxIdleConns(i)
	}
	if i, err := strconv.Atoi(settings.MaxOpenConns); err == nil {
		db.SetMaxOpenConns(i)
	}

	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("the operation was cancelled before starting: %w", ctx.Err())
	default:
		// proceed
	}

	// `sqlds` normally calls `db.PingContext()` to check if the connection is alive,
	// however, as ClickHouse returns its own non-standard `Exception` type, we need
	// to handle it here so that we can log the error code, message and stack trace
	if err := db.PingContext(ctx); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("the operation was cancelled during execution: %w", ctx.Err())
		}

		if exception, ok := err.(*clickhouse.Exception); ok {
			log.DefaultLogger.Error("[%d] %s \n%s\n", exception.Code, exception.Message, exception.StackTrace)
		} else {
			log.DefaultLogger.Error(err.Error())
		}

		backend.Logger.Error("failed to create ClickHouse client")
		backend.Logger.Debug("clickhouse client creation error", "error", err)
		return nil, errorsource.DownstreamError(fmt.Errorf("failed to create ClickHouse client"), false)
	}

	return db, settings.isValid()
}

// Converters defines list of data type converters
func (h *Clickhouse) Converters() []sqlutil.Converter {
	return converters.ClickhouseConverters
}

// Macros returns list of macro functions convert the macros of raw query
func (h *Clickhouse) Macros() sqlds.Macros {
	return macros.Macros
}

// MutateQueryError marks ClickHouse errors as downstream errors
func (h *Clickhouse) MutateQueryError(err error) backend.ErrorWithSource {
	// Check if any error in the error chain (including multi-errors) is a clickhouse.Exception
	if containsClickHouseException(err) {
		return backend.NewErrorWithSource(err, backend.ErrorSourceDownstream)
	}
	return backend.NewErrorWithSource(err, backend.DefaultErrorSource)
}

// containsClickHouseException checks if err or any error in its chain is a clickhouse.Exception
// It also handles errors wrapped in HTTP response bodies
func containsClickHouseException(err error) bool {
	if err == nil {
		return false
	}

	// Check if the current error is directly a clickhouse.Exception
	var wrappedException *clickhouse.Exception
	if errors.As(err, &wrappedException) {
		return true
	}

	errStr := err.Error()

	// Look for common ClickHouse error patterns in response bodies
	if strings.Contains(errStr, "DB::Exception") {
		return true
	}

	// Check for multiple wrapped errors (e.g., from errors.Join)
	type multiError interface {
		Unwrap() []error
	}

	if u, ok := err.(multiError); ok {
		for _, e := range u.Unwrap() {
			if containsClickHouseException(e) {
				return true
			}
		}
	}

	return false
}

func (h *Clickhouse) Settings(ctx context.Context, config backend.DataSourceInstanceSettings) sqlds.DriverSettings {
	settings, err := LoadSettings(ctx, config)
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
		ForwardHeaders: settings.ForwardGrafanaHeaders,
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

// MutateResponse converts fields of type FieldTypeNullableJSON to string,
// except for specific visualizations (traces, tables, and logs).
func (h *Clickhouse) MutateResponse(ctx context.Context, res data.Frames) (data.Frames, error) {
	for _, frame := range res {
		if frame.Meta.PreferredVisualization == data.VisTypeLogs {
			err := mergeOpenTelemetryLabels(frame)
			if err != nil {
				return nil, err
			}
		}

		if shouldConvertFields(frame.Meta.PreferredVisualization) {
			if err := convertNullableJSONFields(frame); err != nil {
				return res, err
			}
		}
	}
	return res, nil
}

// shouldConvertFields determines whether field conversion is needed based on visualization type.
func shouldConvertFields(visType data.VisType) bool {
	return visType != data.VisTypeTrace && visType != data.VisTypeTable && visType != data.VisTypeLogs
}

// convertNullableJSONFields converts all FieldTypeNullableJSON fields in the given frame to string.
func convertNullableJSONFields(frame *data.Frame) error {
	var convertedFields []*data.Field

	for _, field := range frame.Fields {
		if field.Type() == data.FieldTypeNullableJSON {
			newField, err := convertFieldToString(field)
			if err != nil {
				return err
			}
			convertedFields = append(convertedFields, newField)
		} else {
			convertedFields = append(convertedFields, field)
		}
	}

	frame.Fields = convertedFields
	return nil
}

// convertFieldToString creates a new field where JSON values are marshaled into string representations.
func convertFieldToString(field *data.Field) (*data.Field, error) {
	values := make([]*string, field.Len())
	newField := data.NewField(field.Name, field.Labels, values)
	newField.SetConfig(field.Config)

	for i := 0; i < field.Len(); i++ {
		val, _ := field.At(i).(*json.RawMessage)
		if val == nil {
			newField.Set(i, nil)
		} else {
			bytes, err := val.MarshalJSON()
			if err != nil {
				return nil, err
			}
			sVal := string(bytes)
			newField.Set(i, &sVal)
		}
	}

	return newField, nil
}

func extractForwardedHeadersFromMessage(message json.RawMessage) (map[string]string, error) {
	// An example of the message we're trying to parse:
	// {
	//   "grafana-http-headers": {
	//     "x-grafana-org-id": ["12345"],
	//     "x-grafana-user": ["admin"]
	//   }
	// }
	if len(message) == 0 {
		message = []byte("{}")
	}

	messageArgs := make(map[string]interface{})
	err := json.Unmarshal(message, &messageArgs)
	if err != nil {
		backend.Logger.Warn(fmt.Sprintf("Failed to apply headers: %s", err.Error()))
		return nil, errors.New("Couldn't parse message as args")
	}

	httpHeaders := make(map[string]string)
	if grafanaHttpHeaders, ok := messageArgs[sqlds.HeaderKey]; ok {
		fwdHeaders, ok := grafanaHttpHeaders.(map[string]interface{})
		if !ok {
			return nil, errors.New("Couldn't parse grafana HTTP headers")
		}

		for k, v := range fwdHeaders {
			anyHeadersArr, ok := v.([]interface{})
			if !ok {
				return nil, errors.New(fmt.Sprintf("Couldn't parse header %s as an array", k))
			}

			strHeadersArr := make([]string, len(anyHeadersArr))
			for ind, val := range anyHeadersArr {
				strHeadersArr[ind] = val.(string)
			}

			httpHeaders[k] = strings.Join(strHeadersArr, ",")
		}
	}

	return httpHeaders, nil
}

func mergeOpenTelemetryLabels(frame *data.Frame) error {
	var attrFields []*data.Field
	for _, field := range frame.Fields {
		if field.Name == "labels" {
			return nil
		}

		if field.Type() != data.FieldTypeJSON {
			continue
		}

		if field.Name == "ResourceAttributes" || field.Name == "ScopeAttributes" || field.Name == "LogAttributes" {
			attrFields = append(attrFields, field)
		}
	}

	if len(attrFields) == 0 {
		return nil
	}

	rowLen, err := frame.RowLen()
	if err != nil {
		return err
	}

	allLabelsValues := make([]map[string]any, rowLen)

	for _, field := range attrFields {
		for j := 0; j < rowLen; j++ {
			currentVal := allLabelsValues[j]
			if currentVal == nil {
				currentVal = make(map[string]any)
			}

			val := field.At(j).(json.RawMessage)
			if val != nil {
				var valMap map[string]any
				err := json.Unmarshal(val, &valMap)
				if err != nil {
					return err
				}

				assignFlattenedPath(currentVal, field.Name, "", valMap)

				allLabelsValues[j] = currentVal
			}
		}
	}

	allLabelsValuesJSON := make([]json.RawMessage, rowLen)
	for i, value := range allLabelsValues {
		valueJSON, err := json.Marshal(value)
		if err != nil {
			return err
		}

		allLabelsValuesJSON[i] = valueJSON
	}
	allLabels := data.NewField("labels", make(data.Labels), allLabelsValuesJSON)

	filteredFields := make([]*data.Field, 0, len(frame.Fields)-len(attrFields))
	for _, field := range frame.Fields {
		if field.Name == "ResourceAttributes" || field.Name == "ScopeAttributes" || field.Name == "LogAttributes" {
			continue
		}

		filteredFields = append(filteredFields, field)
	}
	filteredFields = append(filteredFields, allLabels)
	frame.Fields = filteredFields

	return nil
}

// assignFlattenedPath will flatten a nested map into a map with top level keys separated by dots.
func assignFlattenedPath(flatMap map[string]any, pathPrefix, pathKey string, pathValue any) {
	fullPath := fmt.Sprintf("%s.%s", pathPrefix, pathKey)
	if pathKey == "" {
		fullPath = pathPrefix
	}

	nestedMap, ok := pathValue.(map[string]any)
	if !ok {
		flatMap[fullPath] = pathValue
		return
	}

	for k, v := range nestedMap {
		assignFlattenedPath(flatMap, fullPath, k, v)
	}
}
