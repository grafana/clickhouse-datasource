package plugin

import (
	"fmt"
	"os"
)

// abortIfCleartextJWTEnvSet exits the test run when the instance-level
// cleartext JWT setting is already exported, since tests assume it is unset
// and would otherwise fail in confusing ways.
func abortIfCleartextJWTEnvSet() {
	if v, ok := os.LookupEnv(cleartextJWTForwardingEnv); ok {
		fmt.Fprintf(os.Stderr, "%s=%q is set in the environment; unset it before running the tests\n", cleartextJWTForwardingEnv, v)
		os.Exit(1)
	}
}
