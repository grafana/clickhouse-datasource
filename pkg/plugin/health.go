package plugin

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// dbProber abstracts the two DB operations used by the enforced-settings health probes,
// allowing the probe logic to be unit-tested without a real ClickHouse connection.
type dbProber struct {
	// queryScalar executes query and scans the first column of the first row as a string.
	queryScalar func(ctx context.Context, query string) (string, error)
	// execQuery executes query and returns any error (nil = success).
	execQuery func(ctx context.Context, query string) error
}

// sqlDBProber builds a dbProber backed by db.
// Callers supply a context already enriched with clickhouse.Context settings when needed.
func sqlDBProber(db *sql.DB) dbProber {
	return dbProber{
		queryScalar: func(ctx context.Context, query string) (string, error) {
			var s string
			return s, db.QueryRowContext(ctx, query).Scan(&s)
		},
		execQuery: func(ctx context.Context, query string) error {
			rows, err := db.QueryContext(ctx, query)
			if rows != nil {
				rows.Close()
			}
			return err
		},
	}
}

// enforcedProbeTimeout returns the timeout to use for each individual probe.
// Capped at 30 s so health checks stay responsive.
func enforcedProbeTimeout(s Settings) time.Duration {
	qt, err := strconv.Atoi(s.QueryTimeout)
	if err != nil || qt <= 0 {
		qt = 30
	}
	if qt > 30 {
		qt = 30
	}
	return time.Duration(qt) * time.Second
}

// runEnforcedHealthProbes runs the three enforced-settings health probes and returns
// a non-nil StatusError result on the first failure, or nil when all pass.
//
// The three probes are:
//
//	(c) Startup readonly check — the connecting user must start at readonly=0 so the plugin
//	    can inject the enforced settings on each query.
//	(a) Round-trip — getSetting('<name>') under the enforced settings map must return the
//	    configured value.
//	(b) Override-rejection — an inline SETTINGS override of each enforced name must fail
//	    with ClickHouse error 164 (READONLY). Success means the setting is marked
//	    CHANGEABLE_IN_READONLY, which silently breaks the guarantee.
//
// The function is package-level (not a method) so it can be unit-tested with a fake prober.
func runEnforcedHealthProbes(ctx context.Context, s Settings, p dbProber) *backend.CheckHealthResult {
	if !s.shouldForceReadOnly() {
		return nil
	}

	timeout := enforcedProbeTimeout(s)

	// Probe (c): verify the connecting user starts at readonly=0.
	cCtx, cCancel := context.WithTimeout(ctx, timeout)
	defer cCancel()
	roVal, err := p.queryScalar(cCtx, "SELECT value FROM system.settings WHERE name='readonly'")
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			backend.Logger.Warn("enforced-settings health: could not query system.settings for readonly", "error", err)
		}
		// Best-effort check; the basic connectivity probe already passed.
	} else if roVal != "0" {
		return &backend.CheckHealthResult{
			Status: backend.HealthStatusError,
			Message: fmt.Sprintf(
				"Connecting ClickHouse user is already readonly=%s; enforced settings cannot be applied on top. Use a user that starts at readonly=0.",
				roVal,
			),
		}
	}

	// Build a context that carries the enforced settings for probes (a) and (b).
	// context.WithTimeout inherits values from its parent, so clickhouse-go sees them.
	enforcedCtx := clickhouse.Context(ctx, clickhouse.WithSettings(buildEnforcedChSettings(s)))

	for name, cfgValueIface := range s.enforcedSettings() {
		var cfgValue string
		if cs, ok := cfgValueIface.(clickhouse.CustomSetting); ok {
			cfgValue = cs.Value
		} else {
			cfgValue = fmt.Sprint(cfgValueIface)
		}

		// Probe (a): round-trip — getSetting must return the configured value.
		aCtx, aCancel := context.WithTimeout(enforcedCtx, timeout)
		got, err := p.queryScalar(aCtx, fmt.Sprintf("SELECT getSetting('%s')", name))
		aCancel()
		if err != nil {
			return &backend.CheckHealthResult{
				Status: backend.HealthStatusError,
				Message: fmt.Sprintf(
					"Enforced setting %q: health probe failed to read back the value via getSetting: %s",
					name, err,
				),
			}
		}
		if got != cfgValue {
			return &backend.CheckHealthResult{
				Status: backend.HealthStatusError,
				Message: fmt.Sprintf(
					"Enforced setting %q: value mismatch — sent %q but getSetting returned %q. "+
						"Check your ClickHouse settings-constraints profile: if the setting is CONST with a different value, the enforced value is silently ignored.",
					name, cfgValue, got,
				),
			}
		}

		// Probe (b): override-rejection — an inline SETTINGS override must fail with code 164.
		bCtx, bCancel := context.WithTimeout(enforcedCtx, timeout)
		execErr := p.execQuery(bCtx, fmt.Sprintf("SELECT 1 SETTINGS %s = '__grafana_enforced_probe__'", name))
		bCancel()
		if execErr == nil {
			// Override succeeded: the setting is CHANGEABLE_IN_READONLY, breaking the guarantee.
			return &backend.CheckHealthResult{
				Status: backend.HealthStatusError,
				Message: fmt.Sprintf(
					"Server permits per-query override of enforced setting %q. "+
						"Check your ClickHouse settings-constraints profile: the setting must not be marked CHANGEABLE_IN_READONLY.",
					name,
				),
			}
		}
		// Code 164 (READONLY) is the expected outcome. Any other error is ambiguous —
		// log a warning but do not fail the health check.
		var ex *clickhouse.Exception
		if !errors.As(execErr, &ex) || ex.Code != 164 {
			backend.Logger.Warn("enforced-settings health: override probe returned unexpected error",
				"setting", name,
			)
		}
	}

	return nil
}

// makeEnforcedSettingsHealthCheck returns a sqlds-compatible PostCheckHealth function
// that opens a short-lived probe connection and runs runEnforcedHealthProbes.
func makeEnforcedSettingsHealthCheck(s Settings, instanceSettings backend.DataSourceInstanceSettings) func(context.Context, *backend.CheckHealthRequest) *backend.CheckHealthResult {
	return func(ctx context.Context, req *backend.CheckHealthRequest) *backend.CheckHealthResult {
		// Use a fresh connection so the probe is independent of the pooled connection
		// and does not interfere with in-flight queries.
		plugin := Clickhouse{}
		db, err := plugin.Connect(ctx, instanceSettings, nil)
		if err != nil {
			backend.Logger.Warn("enforced-settings health: could not open probe connection", "error", err)
			return nil
		}
		defer db.Close()

		return runEnforcedHealthProbes(ctx, s, sqlDBProber(db))
	}
}
