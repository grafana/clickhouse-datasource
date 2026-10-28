package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	sdkconfig "github.com/grafana/grafana-plugin-sdk-go/config"
	"github.com/grafana/sqlds/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubRoundTripper struct {
	resp *http.Response
	err  error
}

func (s stubRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return s.resp, s.err
}

type trackedBody struct {
	io.Reader
	closed bool
}

func (b *trackedBody) Close() error {
	b.closed = true
	return nil
}

func stubResponse(status int, headers map[string]string) (*http.Response, *trackedBody) {
	body := &trackedBody{Reader: strings.NewReader("body")}
	resp := &http.Response{StatusCode: status, Header: http.Header{}, Body: body}
	for k, v := range headers {
		resp.Header.Set(k, v)
	}
	return resp, body
}

func TestNativeResponseCheck(t *testing.T) {
	passes := []struct {
		name    string
		status  int
		headers map[string]string
	}{
		{"native result", http.StatusOK, map[string]string{"X-ClickHouse-Format": "Native", "Content-Type": "application/octet-stream"}},
		{"native in lower case", http.StatusOK, map[string]string{"X-ClickHouse-Format": "native"}},
		{"null format has no body", http.StatusOK, map[string]string{"X-ClickHouse-Format": "Null", "Content-Type": "text/plain; charset=UTF-8"}},
		{"statement without a result", http.StatusOK, map[string]string{"Content-Type": "text/plain; charset=UTF-8"}},
		{"server exception", http.StatusInternalServerError, map[string]string{"X-ClickHouse-Format": "JSON", "Content-Type": "text/html"}},
	}
	for _, tc := range passes {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := stubResponse(tc.status, tc.headers)
			got, err := nativeResponseCheck{next: stubRoundTripper{resp: resp}}.RoundTrip(&http.Request{})
			require.NoError(t, err)
			assert.Same(t, resp, got)
			assert.False(t, body.closed)
		})
	}

	rejects := []struct {
		name    string
		headers map[string]string
		message string
	}{
		{"format clause", map[string]string{"X-ClickHouse-Format": "JSON", "Content-Type": "application/json; charset=UTF-8"}, "the JSON format"},
		{"html page", map[string]string{"Content-Type": "text/html; charset=utf-8"}, "HTML page"},
	}
	for _, tc := range rejects {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := stubResponse(http.StatusOK, tc.headers)
			got, err := nativeResponseCheck{next: stubRoundTripper{resp: resp}}.RoundTrip(&http.Request{})
			assert.Nil(t, got)
			var formatErr *responseFormatError
			require.ErrorAs(t, err, &formatErr)
			assert.Contains(t, err.Error(), tc.message)
			assert.True(t, body.closed)
		})
	}

	t.Run("transport error", func(t *testing.T) {
		dialErr := errors.New("connection refused")
		_, err := nativeResponseCheck{next: stubRoundTripper{err: dialErr}}.RoundTrip(&http.Request{})
		assert.ErrorIs(t, err, dialErr)
	})
}

func TestMutateQueryErrorResponseFormat(t *testing.T) {
	driverErr := fmt.Errorf("sendQuery: %w", &url.Error{
		Op:  "Post",
		URL: "https://clickhouse.example.com:8443/?default_format=Native",
		Err: &responseFormatError{format: "JSON"},
	})
	queryErr := fmt.Errorf("%w: %w", sqlds.ErrorQuery, driverErr)

	got := (&Clickhouse{}).MutateQueryError(queryErr)

	assert.Equal(t, backend.ErrorSourceDownstream, got.ErrorSource())
	assert.ErrorIs(t, got, sqlds.ErrorQuery)
	assert.Contains(t, got.Error(), "the JSON format")
	assert.NotContains(t, got.Error(), "clickhouse.example.com")
}

func TestBuildClickHouseOptionsChecksHTTPResponseFormat(t *testing.T) {
	for protocol, wantCheck := range map[string]bool{"http": true, "native": false} {
		t.Run(protocol, func(t *testing.T) {
			opts, err := buildClickHouseOptions(t.Context(), Settings{Host: "localhost", Port: 8123, Protocol: protocol}, nil)
			require.NoError(t, err)
			if !wantCheck {
				assert.Nil(t, opts.TransportFunc)
				return
			}
			require.NotNil(t, opts.TransportFunc)
			rt, err := opts.TransportFunc(&http.Transport{})
			require.NoError(t, err)
			assert.IsType(t, nativeResponseCheck{}, rt)
		})
	}
}

type idleClosingTransport struct {
	stubRoundTripper
	closed bool
}

func (t *idleClosingTransport) CloseIdleConnections() {
	t.closed = true
}

func TestNativeResponseCheckClosesIdleConnections(t *testing.T) {
	inner := &idleClosingTransport{}
	(&http.Client{Transport: nativeResponseCheck{next: inner}}).CloseIdleConnections()
	assert.True(t, inner.closed)
}

func TestConnectReportsHTMLPageWithoutURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<!DOCTYPE html><html></html>")
	}))
	defer server.Close()
	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	ctx := sdkconfig.WithGrafanaConfig(t.Context(), sdkconfig.NewGrafanaCfg(map[string]string{
		"GF_SQL_ROW_LIMIT":                         "1000",
		"GF_SQL_MAX_OPEN_CONNS_DEFAULT":            "10",
		"GF_SQL_MAX_IDLE_CONNS_DEFAULT":            "10",
		"GF_SQL_MAX_CONN_LIFETIME_SECONDS_DEFAULT": "60",
	}))
	settings := backend.DataSourceInstanceSettings{JSONData: []byte(fmt.Sprintf(`{"server": "%s", "port": %s, "username": "grafana-reader", "protocol": "http"}`, serverURL.Hostname(), serverURL.Port()))}

	_, err = (&Clickhouse{}).Connect(ctx, settings, json.RawMessage{})

	require.Error(t, err)
	assert.True(t, backend.IsDownstreamError(err))
	assert.Contains(t, err.Error(), "[config]")
	assert.Contains(t, err.Error(), "HTML page")
	assert.NotContains(t, err.Error(), serverURL.Host)
	assert.NotContains(t, err.Error(), "grafana-reader")
}
