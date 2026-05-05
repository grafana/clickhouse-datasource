package plugin

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"net"
	"strconv"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/pkg/errors"
)

type ConnectionErrorCategory string

const (
	ConnectionErrorCategoryAuth    ConnectionErrorCategory = "auth"
	ConnectionErrorCategoryNetwork ConnectionErrorCategory = "network"
	ConnectionErrorCategoryTLS     ConnectionErrorCategory = "tls"
	ConnectionErrorCategoryTimeout ConnectionErrorCategory = "timeout"
	ConnectionErrorCategoryConfig  ConnectionErrorCategory = "config"
	ConnectionErrorCategoryServer  ConnectionErrorCategory = "server"
	ConnectionErrorCategoryUnknown ConnectionErrorCategory = "unknown"
)

// configValidationErrors maps sentinel errors from errors.go to their category.
// These are returned by LoadSettings before a connection is attempted.
var configValidationErrors = map[error]ConnectionErrorCategory{
	ErrorMessageInvalidHost:       ConnectionErrorCategoryConfig,
	ErrorMessageInvalidPort:       ConnectionErrorCategoryConfig,
	ErrorMessageInvalidJSON:       ConnectionErrorCategoryConfig,
	ErrorMessageInvalidProtocol:   ConnectionErrorCategoryConfig,
	ErrorInvalidClientCertificate: ConnectionErrorCategoryTLS,
	ErrorInvalidCACertificate:     ConnectionErrorCategoryTLS,
}

// authExceptionCodes are ClickHouse exception codes that indicate auth failures.
var authExceptionCodes = map[int32]bool{
	516: true, // AUTHENTICATION_FAILED
	497: true, // NOT_ENOUGH_PRIVILEGES
	164: true, // READONLY
}

// httpStatusCode extracts the HTTP status code from clickhouse-go HTTP transport
// error strings of the form "[HTTP 403] ...". Returns 0 if not found.
func httpStatusCode(errStr string) int {
	const prefix = "[HTTP "
	i := strings.Index(errStr, prefix)
	if i == -1 {
		return 0
	}
	rest := errStr[i+len(prefix):]
	if len(rest) < 4 || rest[3] != ']' {
		return 0
	}
	code, err := strconv.Atoi(rest[:3])
	if err != nil {
		return 0
	}
	return code
}

// CategorizeConnectionError classifies a connection error into a ConnectionErrorCategory.
// Typed errors are checked first; string matching is used as a fallback for HTTP
// transport errors that the clickhouse-go driver surfaces as plain strings.
func CategorizeConnectionError(err error) ConnectionErrorCategory {
	if err == nil {
		return ConnectionErrorCategoryUnknown
	}

	for sentinel, category := range configValidationErrors {
		if errors.Is(err, sentinel) {
			return category
		}
	}

	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ConnectionErrorCategoryTimeout
	}
	if errors.Is(err, clickhouse.ErrAcquireConnTimeout) {
		return ConnectionErrorCategoryTimeout
	}
	if errors.Is(err, clickhouse.ErrAcquireConnNoAddress) {
		return ConnectionErrorCategoryConfig
	}

	var exception *clickhouse.Exception
	if errors.As(err, &exception) {
		if authExceptionCodes[exception.Code] {
			return ConnectionErrorCategoryAuth
		}
		return ConnectionErrorCategoryServer
	}

	var certVerifyErr *tls.CertificateVerificationError
	if errors.As(err, &certVerifyErr) {
		return ConnectionErrorCategoryTLS
	}
	var unknownAuthErr x509.UnknownAuthorityError
	if errors.As(err, &unknownAuthErr) {
		return ConnectionErrorCategoryTLS
	}
	var certInvalidErr x509.CertificateInvalidError
	if errors.As(err, &certInvalidErr) {
		return ConnectionErrorCategoryTLS
	}
	var hostnameErr x509.HostnameError
	if errors.As(err, &hostnameErr) {
		return ConnectionErrorCategoryTLS
	}

	var opErr *net.OpError
	if errors.As(err, &opErr) && opErr.Op == "dial" {
		return ConnectionErrorCategoryNetwork
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return ConnectionErrorCategoryNetwork
	}

	errStr := err.Error()

	// TLS string patterns must come before network patterns — TLS errors are often
	// wrapped inside a net.OpError with Op "read" rather than "dial".
	if strings.Contains(errStr, "tls:") ||
		strings.Contains(errStr, "x509:") ||
		strings.Contains(errStr, "certificate") {
		return ConnectionErrorCategoryTLS
	}

	if code := httpStatusCode(errStr); code != 0 {
		switch {
		case code == 401 || code == 403:
			return ConnectionErrorCategoryAuth
		case code == 408 || code == 504:
			return ConnectionErrorCategoryTimeout
		case code == 502 || code == 503:
			return ConnectionErrorCategoryNetwork
		case code >= 400 && code < 500:
			return ConnectionErrorCategoryAuth // remaining 4xx treated as access-control
		case code >= 500:
			return ConnectionErrorCategoryServer
		}
	}

	if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline exceeded") {
		return ConnectionErrorCategoryTimeout
	}
	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "network is unreachable") ||
		strings.Contains(errStr, "connection reset by peer") {
		return ConnectionErrorCategoryNetwork
	}
	if strings.Contains(errStr, "DB::Exception") {
		return ConnectionErrorCategoryServer
	}

	return ConnectionErrorCategoryUnknown
}
