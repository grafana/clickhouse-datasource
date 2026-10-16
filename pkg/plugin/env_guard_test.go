package plugin

import (
	"fmt"
	"os"
)

// abortIfClearTextJWTEnvSet exits the test run when the instance-level
// clear text JWT setting is already exported, since tests assume it is unset
// and would otherwise fail in confusing ways.
func abortIfClearTextJWTEnvSet() {
	if v, ok := os.LookupEnv(clearTextJWTForwardingEnv); ok {
		fmt.Fprintf(os.Stderr, "%s=%q is set in the environment; unset it before running the tests\n", clearTextJWTForwardingEnv, v)
		os.Exit(1)
	}
}
