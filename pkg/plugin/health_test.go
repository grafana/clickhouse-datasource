package plugin

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makeEnforcedTestSettings builds a Settings with one enforced custom setting.
func makeEnforcedTestSettings(name, value string) Settings {
	return Settings{
		EnforceReadOnly: true,
		QueryTimeout:    "10",
		CustomSettings: []CustomSetting{
			{Setting: name, Value: value, Enforced: true},
		},
	}
}

// fakeProber builds a dbProber that uses queryFn and execFn.
// Either function may call t.Helper() / record calls as needed.
func fakeProber(queryFn func(ctx context.Context, q string) (string, error), execFn func(ctx context.Context, q string) error) dbProber {
	return dbProber{
		queryScalar: queryFn,
		execQuery:   execFn,
	}
}

// sharedFakeProber returns a prober whose behaviour is driven by the supplied map:
//   - "system.settings" key controls the readonly row scan (probe c)
//   - "getSetting"      key controls the round-trip value (probe a)
//   - "exec"            key controls the override-rejection error (probe b)
//
// This simplifies the common test cases that only want to exercise one failure mode.
func sharedFakeProber(
	roVal string, roErr error,
	getSettingVal string, getSettingErr error,
	execErr error,
) dbProber {
	return fakeProber(
		func(_ context.Context, q string) (string, error) {
			if strings.Contains(q, "system.settings") {
				return roVal, roErr
			}
			return getSettingVal, getSettingErr
		},
		func(_ context.Context, _ string) error { return execErr },
	)
}

func TestRunEnforcedHealthProbes_HappyPath(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("0", nil, "val1", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	assert.Nil(t, result, "all probes pass → should return nil")
}

func TestRunEnforcedHealthProbes_NoEnforcedSettings(t *testing.T) {
	s := Settings{EnforceReadOnly: false, QueryTimeout: "10"}
	p := sharedFakeProber("0", nil, "anything", nil, fmt.Errorf("should not be called"))
	result := runEnforcedHealthProbes(context.Background(), s, p)
	assert.Nil(t, result, "no enforced settings → should short-circuit and return nil")
}

func TestRunEnforcedHealthProbes_UserAlreadyReadonly(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "val1")
	// Simulate a user that already has readonly=1 at the server level.
	p := sharedFakeProber("1", nil, "val1", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result)
	assert.Equal(t, backend.HealthStatusError, result.Status)
	assert.Contains(t, result.Message, "already readonly=1")
	assert.Contains(t, result.Message, "readonly=0")
}

func TestRunEnforcedHealthProbes_UserAlreadyReadonly2(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("2", nil, "val1", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result)
	assert.Equal(t, backend.HealthStatusError, result.Status)
	assert.Contains(t, result.Message, "already readonly=2")
}

func TestRunEnforcedHealthProbes_ReadonlyQueryError_NonFatal(t *testing.T) {
	// system.settings query error should not block the health check (best-effort).
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("", fmt.Errorf("connection refused"), "val1", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	// Should still pass since the connection probe already succeeded.
	assert.Nil(t, result)
}

func TestRunEnforcedHealthProbes_ErrNoRows_NonFatal(t *testing.T) {
	// ErrNoRows from system.settings means the readonly setting is absent → default 0.
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("", sql.ErrNoRows, "val1", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	assert.Nil(t, result)
}

func TestRunEnforcedHealthProbes_ValueMismatch(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "expected_val")
	// getSetting returns a different value (e.g. a CONST profile overrides it).
	p := sharedFakeProber("0", nil, "server_forced_val", nil, &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result)
	assert.Equal(t, backend.HealthStatusError, result.Status)
	assert.Contains(t, result.Message, "value mismatch")
	assert.Contains(t, result.Message, "custom_x")
}

func TestRunEnforcedHealthProbes_GetSettingError(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("0", nil, "", fmt.Errorf("unknown setting"), &clickhouse.Exception{Code: 164})
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result)
	assert.Equal(t, backend.HealthStatusError, result.Status)
	assert.Contains(t, result.Message, "health probe failed")
	assert.Contains(t, result.Message, "custom_x")
}

func TestRunEnforcedHealthProbes_SettingOverridable(t *testing.T) {
	s := makeEnforcedTestSettings("custom_x", "val1")
	// Override probe succeeds → setting is CHANGEABLE_IN_READONLY (bad).
	p := sharedFakeProber("0", nil, "val1", nil, nil)
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result)
	assert.Equal(t, backend.HealthStatusError, result.Status)
	assert.Contains(t, result.Message, "CHANGEABLE_IN_READONLY")
	assert.Contains(t, result.Message, "custom_x")
}

func TestRunEnforcedHealthProbes_UnexpectedExecError_Warning(t *testing.T) {
	// An override probe returning a non-164 error is ambiguous:
	// we log a warning but do not fail the health check.
	s := makeEnforcedTestSettings("custom_x", "val1")
	p := sharedFakeProber("0", nil, "val1", nil, fmt.Errorf("some other DB error"))
	result := runEnforcedHealthProbes(context.Background(), s, p)
	assert.Nil(t, result, "non-164 error from override probe is a warning, not a failure")
}

func TestRunEnforcedHealthProbes_MultipleSettings_FirstFails(t *testing.T) {
	s := Settings{
		EnforceReadOnly: true,
		QueryTimeout:    "10",
		CustomSettings: []CustomSetting{
			{Setting: "custom_a", Value: "v1", Enforced: true},
			{Setting: "custom_b", Value: "v2", Enforced: true},
		},
	}
	// custom_a will cause a mismatch, custom_b is fine.
	// We just need to confirm that a failure is returned (not necessarily for custom_a
	// since map iteration order is random).
	badVal := map[string]string{"custom_a": "WRONG", "custom_b": "v2"}
	p := fakeProber(
		func(_ context.Context, q string) (string, error) {
			if strings.Contains(q, "system.settings") {
				return "0", nil
			}
			for setting, ret := range badVal {
				if strings.Contains(q, setting) {
					return ret, nil
				}
			}
			return "", fmt.Errorf("unexpected query: %s", q)
		},
		func(_ context.Context, _ string) error { return &clickhouse.Exception{Code: 164} },
	)
	result := runEnforcedHealthProbes(context.Background(), s, p)
	require.NotNil(t, result, "mismatch on custom_a should produce a failure")
	assert.Equal(t, backend.HealthStatusError, result.Status)
}

func TestEnforcedProbeTimeout_Default(t *testing.T) {
	s := Settings{QueryTimeout: ""}
	d := enforcedProbeTimeout(s)
	assert.Equal(t, 30, int(d.Seconds()))
}

func TestEnforcedProbeTimeout_Capped(t *testing.T) {
	s := Settings{QueryTimeout: "120"}
	d := enforcedProbeTimeout(s)
	assert.Equal(t, 30, int(d.Seconds()), "timeout should be capped at 30 s")
}

func TestEnforcedProbeTimeout_Short(t *testing.T) {
	s := Settings{QueryTimeout: "5"}
	d := enforcedProbeTimeout(s)
	assert.Equal(t, 5, int(d.Seconds()))
}
