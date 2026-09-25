package plugin

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"io"
	"math/big"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// tlsTestServer is a TLS listener that completes handshakes and records the
// SNI name the client offered.
type tlsTestServer struct {
	port    string
	certPEM *x509.Certificate

	mu  sync.Mutex
	sni string
}

// serverName returns the SNI name recorded from the last handshake.
func (s *tlsTestServer) serverName() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sni
}

// addr returns host:port for this server. crypto/tls omits SNI for IP
// addresses, so tests pass a hostname.
func (s *tlsTestServer) addr(host string) string {
	return net.JoinHostPort(host, s.port)
}

// rootCAs returns a pool trusting only this server's self-signed certificate.
func (s *tlsTestServer) rootCAs() *x509.CertPool {
	pool := x509.NewCertPool()
	pool.AddCert(s.certPEM)
	return pool
}

func startTLSTestServer(t *testing.T) *tlsTestServer {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	require.NoError(t, err)

	parsed, err := x509.ParseCertificate(der)
	require.NoError(t, err)

	srv := &tlsTestServer{certPEM: parsed}

	cfg := &tls.Config{
		Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}},
		GetConfigForClient: func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
			srv.mu.Lock()
			srv.sni = hello.ServerName
			srv.mu.Unlock()
			return nil, nil
		},
	}

	listener, err := tls.Listen("tcp", "127.0.0.1:0", cfg)
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	_, port, err := net.SplitHostPort(listener.Addr().String())
	require.NoError(t, err)
	srv.port = port

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer func() { _ = conn.Close() }()
				// Hold the connection open until the client hangs up, so the
				// handshake is not torn down before the client observes it.
				_, _ = io.Copy(io.Discard, conn)
			}()
		}
	}()

	return srv
}

// directContextDialer stands in for the PDC secure SOCKS dialer, which returns
// a tunneled connection with no TLS of its own.
type directContextDialer struct{}

func (directContextDialer) Dial(network, addr string) (net.Conn, error) {
	return net.Dial(network, addr)
}

func (directContextDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	var d net.Dialer
	return d.DialContext(ctx, network, addr)
}

// The native protocol needs the proxied connection returned already wrapped,
// because clickhouse-go does not apply Options.TLS once a DialContext is set.
// HTTP must stay unwrapped: net/http applies TLS over the dialer.
func TestProxyDialContextTLSWrapping(t *testing.T) {
	srv := startTLSTestServer(t)

	tests := []struct {
		name      string
		tlsConfig *tls.Config
		protocol  clickhouse.Protocol
		wantTLS   bool
	}{
		{
			name:      "native protocol with TLS is wrapped",
			tlsConfig: &tls.Config{InsecureSkipVerify: true},
			protocol:  clickhouse.Native,
			wantTLS:   true,
		},
		{
			name:      "http protocol is not wrapped",
			tlsConfig: &tls.Config{InsecureSkipVerify: true},
			protocol:  clickhouse.HTTP,
			wantTLS:   false,
		},
		{
			name:      "native protocol without TLS is not wrapped",
			tlsConfig: nil,
			protocol:  clickhouse.Native,
			wantTLS:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dial := proxyDialContext(directContextDialer{}, tt.tlsConfig, tt.protocol)

			conn, err := dial(t.Context(), srv.addr("localhost"))
			require.NoError(t, err)
			defer func() { _ = conn.Close() }()

			_, isTLS := conn.(*tls.Conn)
			assert.Equal(t, tt.wantTLS, isTLS, "connection TLS state must match the protocol and TLS settings")
		})
	}
}

// Verification must run for real, not just yield a *tls.Conn.
func TestProxyDialContextVerifiesServer(t *testing.T) {
	srv := startTLSTestServer(t)

	t.Run("verification succeeds against a trusted CA", func(t *testing.T) {
		dial := proxyDialContext(directContextDialer{}, &tls.Config{RootCAs: srv.rootCAs()}, clickhouse.Native)

		conn, err := dial(t.Context(), srv.addr("localhost"))
		require.NoError(t, err)
		defer func() { _ = conn.Close() }()

		assert.IsType(t, &tls.Conn{}, conn)
	})

	t.Run("verification fails against an untrusted CA", func(t *testing.T) {
		dial := proxyDialContext(directContextDialer{}, &tls.Config{RootCAs: x509.NewCertPool()}, clickhouse.Native)

		conn, err := dial(t.Context(), srv.addr("localhost"))
		require.Error(t, err, "an untrusted server certificate must fail the handshake")
		assert.Nil(t, conn)
	})
}

// tls.Client does not derive SNI from the address, unlike tls.Dial.
func TestProxyDialContextServerName(t *testing.T) {
	t.Run("derived from the dial address when unset", func(t *testing.T) {
		srv := startTLSTestServer(t)
		tlsConfig := &tls.Config{InsecureSkipVerify: true}

		dial := proxyDialContext(directContextDialer{}, tlsConfig, clickhouse.Native)
		conn, err := dial(t.Context(), srv.addr("localhost"))
		require.NoError(t, err)
		defer func() { _ = conn.Close() }()

		assert.Equal(t, "localhost", srv.serverName(), "SNI must be derived from the dial address")
		assert.Empty(t, tlsConfig.ServerName, "the config shared with clickhouse.Options.TLS must not be mutated")
	})

	t.Run("configured server name is preserved", func(t *testing.T) {
		srv := startTLSTestServer(t)
		tlsConfig := &tls.Config{InsecureSkipVerify: true, ServerName: "clickhouse.example.com"}

		dial := proxyDialContext(directContextDialer{}, tlsConfig, clickhouse.Native)
		conn, err := dial(t.Context(), srv.addr("localhost"))
		require.NoError(t, err)
		defer func() { _ = conn.Close() }()

		assert.Equal(t, "clickhouse.example.com", srv.serverName(), "an explicit ServerName must win over the dial address")
	})
}

// A dial failure must surface rather than hide behind the TLS wrapping.
func TestProxyDialContextDialErrorIsReturned(t *testing.T) {
	dial := proxyDialContext(failingContextDialer{}, &tls.Config{InsecureSkipVerify: true}, clickhouse.Native)

	conn, err := dial(t.Context(), "localhost:9440")
	require.Error(t, err)
	assert.Nil(t, conn)
}

type failingContextDialer struct{}

func (failingContextDialer) Dial(network, addr string) (net.Conn, error) {
	return nil, fmt.Errorf("proxy unavailable")
}

func (failingContextDialer) DialContext(_ context.Context, _, _ string) (net.Conn, error) {
	return nil, fmt.Errorf("proxy unavailable")
}
