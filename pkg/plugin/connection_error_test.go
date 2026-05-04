package plugin

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/pkg/errors"
	"github.com/stretchr/testify/assert"
)

func TestCategorizeConnectionError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected ConnectionErrorCategory
	}{
		// nil
		{
			name:     "nil error",
			err:      nil,
			expected: ConnectionErrorCategoryUnknown,
		},

		// --- Timeout ---
		{
			name:     "context deadline exceeded",
			err:      context.DeadlineExceeded,
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "context canceled",
			err:      context.Canceled,
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "clickhouse acquire conn timeout",
			err:      clickhouse.ErrAcquireConnTimeout,
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "wrapped context deadline exceeded",
			err:      fmt.Errorf("outer: %w", context.DeadlineExceeded),
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "timeout in error string",
			err:      errors.New("read tcp: i/o timeout"),
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "deadline exceeded in error string",
			err:      errors.New("operation timed out: deadline exceeded"),
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "HTTP 408",
			err:      errors.New("clickhouse [HTTP 408]: request timeout"),
			expected: ConnectionErrorCategoryTimeout,
		},
		{
			name:     "HTTP 504",
			err:      errors.New("clickhouse [HTTP 504]: gateway timeout"),
			expected: ConnectionErrorCategoryTimeout,
		},

		// --- Config ---
		{
			name:     "clickhouse no address",
			err:      clickhouse.ErrAcquireConnNoAddress,
			expected: ConnectionErrorCategoryConfig,
		},
		{
			name:     "wrapped no address",
			err:      fmt.Errorf("connect: %w", clickhouse.ErrAcquireConnNoAddress),
			expected: ConnectionErrorCategoryConfig,
		},

		// --- Auth — native, via clickhouse.Exception ---
		{
			name:     "exception 516 AUTHENTICATION_FAILED",
			err:      &clickhouse.Exception{Code: 516, Message: "Authentication failed"},
			expected: ConnectionErrorCategoryAuth,
		},
		{
			name:     "exception 497 NOT_ENOUGH_PRIVILEGES",
			err:      &clickhouse.Exception{Code: 497, Message: "Not enough privileges"},
			expected: ConnectionErrorCategoryAuth,
		},
		{
			name:     "exception 164 READONLY",
			err:      &clickhouse.Exception{Code: 164, Message: "Attempt to execute query in read-only mode"},
			expected: ConnectionErrorCategoryAuth,
		},
		{
			name:     "wrapped exception 516",
			err:      fmt.Errorf("ping: %w", &clickhouse.Exception{Code: 516, Message: "Authentication failed"}),
			expected: ConnectionErrorCategoryAuth,
		},

		// --- Auth — HTTP, via status code strings ---
		{
			name:     "HTTP 401",
			err:      errors.New("clickhouse [HTTP 401]: Unauthorized"),
			expected: ConnectionErrorCategoryAuth,
		},
		{
			name:     "HTTP 403",
			err:      errors.New("clickhouse [HTTP 403]: Forbidden"),
			expected: ConnectionErrorCategoryAuth,
		},
		{
			name:     "HTTP 400 falls through to auth (4xx bucket)",
			err:      errors.New("clickhouse [HTTP 400]: Bad Request"),
			expected: ConnectionErrorCategoryAuth,
		},

		// --- Server — native, via clickhouse.Exception ---
		{
			name:     "exception with non-auth code",
			err:      &clickhouse.Exception{Code: 60, Message: "Table does not exist"},
			expected: ConnectionErrorCategoryServer,
		},
		{
			name:     "DB::Exception in string",
			err:      errors.New("DB::Exception: Table test.foo doesn't exist. (UNKNOWN_TABLE)"),
			expected: ConnectionErrorCategoryServer,
		},
		{
			name:     "HTTP 500",
			err:      errors.New("clickhouse [HTTP 500]: Internal Server Error"),
			expected: ConnectionErrorCategoryServer,
		},
		{
			name:     "HTTP 504 already handled by timeout, 500 is server",
			err:      errors.New("[HTTP 500]"),
			expected: ConnectionErrorCategoryServer,
		},

		// --- Network ---
		{
			name: "net.OpError dial connection refused",
			err: &net.OpError{
				Op:  "dial",
				Net: "tcp",
				Err: &net.AddrError{Err: "connection refused"},
			},
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "net.DNSError",
			err:      &net.DNSError{Err: "no such host", Name: "invalid.example.com"},
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "connection refused in string",
			err:      errors.New("dial tcp: connect: connection refused"),
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "no such host in string",
			err:      errors.New("dial tcp: lookup invalid.example.com: no such host"),
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "network is unreachable",
			err:      errors.New("dial tcp: connect: network is unreachable"),
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "connection reset by peer",
			err:      errors.New("read tcp: connection reset by peer"),
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "HTTP 502",
			err:      errors.New("clickhouse [HTTP 502]: Bad Gateway"),
			expected: ConnectionErrorCategoryNetwork,
		},
		{
			name:     "HTTP 503",
			err:      errors.New("clickhouse [HTTP 503]: Service Unavailable"),
			expected: ConnectionErrorCategoryNetwork,
		},

		// --- TLS ---
		{
			name: "tls.CertificateVerificationError",
			err: &tls.CertificateVerificationError{
				UnverifiedCertificates: []*x509.Certificate{},
				Err:                    errors.New("certificate signed by unknown authority"),
			},
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "x509.UnknownAuthorityError",
			err:      x509.UnknownAuthorityError{},
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name: "x509.CertificateInvalidError",
			err: x509.CertificateInvalidError{
				Cert:   &x509.Certificate{},
				Reason: x509.Expired,
			},
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name: "x509.HostnameError",
			err: x509.HostnameError{
				Certificate: &x509.Certificate{},
				Host:        "wrong.host.example.com",
			},
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "tls: in error string",
			err:      errors.New("tls: handshake failure"),
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "x509: in error string",
			err:      errors.New("x509: certificate has expired or is not yet valid"),
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "certificate in error string",
			err:      errors.New("remote error: tls: bad certificate"),
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name: "net.OpError wrapping TLS error (read op, not dial)",
			err: &net.OpError{
				Op:  "read",
				Net: "tcp",
				Err: errors.New("tls: certificate signed by unknown authority"),
			},
			expected: ConnectionErrorCategoryTLS,
		},

		// --- Config validation sentinel errors (errors.go) ---
		{
			name:     "invalid host",
			err:      ErrorMessageInvalidHost,
			expected: ConnectionErrorCategoryConfig,
		},
		{
			name:     "invalid port",
			err:      ErrorMessageInvalidPort,
			expected: ConnectionErrorCategoryConfig,
		},
		{
			name:     "invalid json",
			err:      ErrorMessageInvalidJSON,
			expected: ConnectionErrorCategoryConfig,
		},
		{
			name:     "invalid protocol",
			err:      ErrorMessageInvalidProtocol,
			expected: ConnectionErrorCategoryConfig,
		},
		{
			name:     "invalid client certificate",
			err:      ErrorInvalidClientCertificate,
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "invalid CA certificate",
			err:      ErrorInvalidCACertificate,
			expected: ConnectionErrorCategoryTLS,
		},
		{
			name:     "wrapped invalid host (via backend.DownstreamError)",
			err:      fmt.Errorf("downstream: %w", ErrorMessageInvalidHost),
			expected: ConnectionErrorCategoryConfig,
		},

		// --- Unknown ---
		{
			name:     "completely unknown error",
			err:      errors.New("something went very wrong"),
			expected: ConnectionErrorCategoryUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CategorizeConnectionError(tt.err)
			assert.Equal(t, tt.expected, got)
		})
	}
}
