package plugin

import (
	"fmt"
	"mime"
	"net/http"
	"strings"
)

type responseFormatError struct {
	format string
}

func (e *responseFormatError) Error() string {
	if e.format == "" {
		return "the server returned an HTML page, not a ClickHouse response. Check the data source URL, port and HTTP path, and any proxy in front of ClickHouse"
	}
	return fmt.Sprintf("the query asks for results in the %s format, but the data source reads only the Native format. Remove the FORMAT clause from the query", e.format)
}

// nativeResponseCheck rejects a successful HTTP response that is not in the Native format, before the driver tries to decode it.
type nativeResponseCheck struct {
	next http.RoundTripper
}

func (c nativeResponseCheck) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := c.next.RoundTrip(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return resp, err
	}
	format := resp.Header.Get("X-ClickHouse-Format")
	if !readableFormat(format, resp.Header.Get("Content-Type")) {
		_ = resp.Body.Close()
		return nil, &responseFormatError{format: format}
	}
	return resp, nil
}

func (c nativeResponseCheck) CloseIdleConnections() {
	if closer, ok := c.next.(interface{ CloseIdleConnections() }); ok {
		closer.CloseIdleConnections()
	}
}

func readableFormat(format, contentType string) bool {
	if format == "" {
		mediaType, _, _ := mime.ParseMediaType(contentType)
		return mediaType != "text/html"
	}
	// Null writes no body, which the driver reads as an empty result.
	return strings.EqualFold(format, "Native") || strings.EqualFold(format, "Null")
}
