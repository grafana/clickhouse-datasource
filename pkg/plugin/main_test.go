//go:build !integration

package plugin

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	abortIfCleartextJWTEnvSet()
	os.Exit(m.Run())
}
