//go:build !integration

package plugin

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	abortIfClearTextJWTEnvSet()
	os.Exit(m.Run())
}
