package plugin

import "github.com/pkg/errors"

var (
	ErrorMessageInvalidJSON       = errors.New("could not parse json")
	ErrorMessageInvalidHost       = errors.New("invalid server host. Either empty or not set")
	ErrorMessageInvalidPort       = errors.New("invalid port")
	ErrorMessageInvalidUserName   = errors.New("username is either empty or not set")
	ErrorMessageInvalidPassword   = errors.New("password is either empty or not set")
	ErrorMessageInvalidProtocol   = errors.New("protocol is invalid, use native or http")
	ErrorInvalidClientCertificate = errors.New("tls: failed to find any PEM data in certificate input")
	ErrorInvalidCACertificate     = errors.New("failed to parse TLS CA PEM certificate")
)
