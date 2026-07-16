# Implementation plan: enforced per-query settings + `readonly=1`

Goal: let operators configure ClickHouse settings (typically a
`custom_*` tenant variable) that are injected into every query executed
via the datasource and cannot be overridden by the end user's SQL. The
enforcement mechanism is per-query `readonly=1` combined with the
enforced setting values, sent out-of-band with the SQL. No SQL
rewriting, no per-tenant DB user, no persistent ClickHouse session.

Companion design notes: `notes-enforced-settings.md`.

---

## Phase 0 — Prep

1. Reproduce the mechanism manually against a local ClickHouse:
   - Verify that `SELECT getSetting('custom_x') SETTINGS custom_x='foo', readonly=1`
     succeeds and returns `foo`.
   - Verify `SELECT getSetting('custom_x') SETTINGS custom_x='foo', readonly=1, custom_x='bar'`
     is rejected (user attempts override).
   - Verify `SELECT 1 SETTINGS readonly=0` under a `readonly=1` request
     is rejected.
   - Verify `SET custom_x='bar'` under `readonly=1` is rejected.
   - Verify `INSERT`, `CREATE`, `ALTER`, `remote()`, `url()`, `file()`,
     `s3()` behavior under `readonly=1` on the target ClickHouse
     version. Document any surprises.
   - Repeat over both Native and HTTP protocols.
2. Confirm clickhouse-go v2 API for per-query settings on the version
   pinned in `go.mod`: `clickhouse.Context(ctx, clickhouse.WithSettings(clickhouse.Settings{...}))`.

Deliverable: a short note captured in the PR description with the
observed behavior on the CH versions we care about (LTS + latest).

---

## Phase 1 — Config surface

Files: `pkg/plugin/settings.go`, `src/types.ts` (or wherever the
datasource config types live), `src/views/CHConfigEditor/*` for the UI.

1. Extend `CustomSetting` (backwards compatible):
   ```go
   type CustomSetting struct {
       Setting  string `json:"setting"`
       Value    string `json:"value"`
       Enforced bool   `json:"enforced,omitempty"`
   }
   ```
   Alternatively, introduce a second field `EnforcedSettings` and keep
   `CustomSettings` as-is. Prefer the flag on the existing struct to
   avoid a second UI list; call this out in the PR description so
   reviewers can push back if they'd rather split them.
2. Add a datasource-level toggle `EnforceReadOnly bool
   \`json:"enforceReadOnly,omitempty"\``. When any `CustomSetting` has
   `Enforced=true`, force this to `true` on load (with a warning log if
   it was false). Otherwise it's an operator opt-in that means "force
   `readonly=1` on every query even without enforced settings" — useful
   for pure lockdown deployments.
3. Update `LoadSettings` to parse the new fields (both bool and
   string shapes, following the existing pattern in this file).
4. In the config editor UI, add:
   - A checkbox column next to each Custom Setting row: "Enforced (send
     as `readonly=1`)".
   - A standalone "Enforce read-only on all queries" toggle bound to
     `enforceReadOnly`.
   - Help text warning that enforced settings must **not** be marked
     `CHANGEABLE_IN_READONLY` on the ClickHouse server, and that
     enabling this makes the datasource read-only (no INSERT/DDL from
     Grafana).
5. Documentation:
   - Add a section to `README.md` and/or `docs/` explaining the pattern,
     the row-policy companion (`getSetting('custom_x')`), the
     `changeable_in_readonly` footgun, and the operator's option of
     whitelisting specific tunables (`max_threads`, `max_memory_usage`)
     as `CHANGEABLE_IN_READONLY` server-side.
6. Unit test in `settings_test.go` covering parse of both new fields,
   both JSON shapes.

Deliverable: config-only PR (no runtime behavior change yet) that can
be reviewed independently.

---

## Phase 2 — Runtime injection

Files: `pkg/plugin/driver.go`.

1. Add a helper on `Settings`:
   ```go
   // EnforcedSettings returns the subset of CustomSettings marked
   // Enforced. Returns nil if empty.
   func (s Settings) enforcedSettings() clickhouse.Settings { ... }

   func (s Settings) shouldForceReadOnly() bool {
       return s.EnforceReadOnly || len(s.enforcedSettings()) > 0
   }
   ```
2. At pool creation in `driver.go`, do **not** put enforced settings
   into `Options.Settings` — they need to be re-applied per query
   (values may depend on request context in future; and we want
   `readonly=1` to be the last thing applied, deterministically).
   Leave the existing pool-level `customSettings` behavior for
   non-enforced entries.
3. Introduce a wrapper that attaches enforced settings to the query
   context. Two candidate integration points:
   - **Preferred**: inside the sqlds handler path. sqlds calls
     `DB.QueryContext` under the hood; we need the context passed to
     that call to carry `clickhouse.WithSettings`. The plugin already
     implements `MutateQuery(ctx, req) -> (ctx, req)` — extend that to
     attach the enforced settings to `ctx`. Verify sqlds threads the
     returned `ctx` all the way to the driver call.
   - **Fallback**: wrap the `*sql.DB` returned to sqlds so every
     `QueryContext`/`ExecContext`/`PrepareContext` call unwraps or
     augments the context. More invasive but robust.
4. The settings map to attach per query:
   ```go
   s := clickhouse.Settings{}
   for k, v := range settings.enforcedSettings() { s[k] = v }
   if settings.shouldForceReadOnly() { s["readonly"] = uint8(1) }
   ctx = clickhouse.Context(ctx, clickhouse.WithSettings(s))
   ```
   Ordering note: whether `readonly` goes into the same map as the
   enforced value is fine — ClickHouse applies the whole map atomically
   before parsing the SQL. Confirmed in Phase 0.
5. Keep the existing pool-level `Options.Settings` for
   non-enforced `customSettings` and `limit`. Enforced settings must not
   be duplicated pool-side, so they're always re-applied at
   query-context level (single source of truth).
6. Do **not** touch `query.RawSQL`. Macro interpolation, comment
   injection, and `MutateQueryData` remain unchanged.
7. Error mapping: in the existing `MutateQueryError`, detect
   ClickHouse's readonly-rejection error code (currently `164
   READONLY`) and surface a friendlier message like: "This datasource
   is configured to enforce read-only queries; `SET`/`SETTINGS` clauses
   that change server settings are not allowed. Contact your
   administrator." Keep the original error attached.

Deliverable: runtime PR building on Phase 1, with unit tests for the
context-attachment helper.

---

## Phase 3 — Health check / config validation

Files: `pkg/plugin/datasource.go` (CheckHealth path),
`pkg/plugin/schema.go` (if reused there).

1. Extend the datasource health check. When enforced settings are
   configured, additionally probe:
   - `SELECT getSetting('<enforced_name>')` under the enforced
     settings map → must succeed and return the configured value.
   - `SELECT 1 SETTINGS <enforced_name>='__probe_override__'`
     under the enforced settings map → must **fail** with
     `READONLY` (or the query result must still show the enforced
     value, depending on CH version). If it succeeds and returns the
     override value, the enforced setting is `CHANGEABLE_IN_READONLY`
     on the server — surface a loud failure in health output.
   - Query `system.settings_profile_elements` /
     `system.settings` for the connecting user to verify no
     conflicting `readonly=1` server-side profile (which would prevent
     us from setting the enforced value in the first place).
2. Return actionable messages for the three failure modes (setting
   missing, setting overridable, connecting user already readonly).
3. Add integration coverage — see Phase 4.

Deliverable: health-check PR, small.

---

## Phase 4 — Tests

Files: `pkg/plugin/driver_test.go`,
`pkg/plugin/driver_integration_test.go`,
`pkg/plugin/settings_test.go`.

1. Unit tests:
   - `settings_test.go`: JSON parse for new fields, defaulting rules
     (`Enforced=true` implies `EnforceReadOnly=true` at load), both
     bool/string encodings.
   - `driver_test.go`: verify the query context carries the correct
     `clickhouse.Settings` when enforced settings are configured.
     Use a fake settings map extraction hook — or add a small exported
     accessor for tests to read the value out of `ctx`.
2. Integration tests (opt-in via existing tags; both Native and HTTP):
   - Positive path: enforced setting is visible via `getSetting` inside
     the user's SELECT.
   - Override rejection: a user query with `SETTINGS custom_x='evil'`
     fails with `READONLY`.
   - `SET` rejection: multi-statement `SET custom_x='evil'; SELECT ...`
     fails.
   - Downgrade rejection: `SETTINGS readonly=0` fails.
   - Whitelisted tunable: a server-side `CHANGEABLE_IN_READONLY`
     setting (e.g. `max_threads`) can still be tuned per query
     (proves we didn't over-restrict).
   - Health check: probe query behavior across the three failure modes
     above.
3. Extend `docker-compose.yml` / test fixtures with a users.xml (or SQL
   grant script) that:
   - Creates a test user with a `custom_visible_tenants` setting
     available.
   - Marks `max_threads` as `CHANGEABLE_IN_READONLY` for the whitelist
     test.
   - Ensures no `CONST` on `custom_visible_tenants` (so the plugin's
     value takes effect, not a server default).

Deliverable: tests committed alongside their respective phase PRs, not
in a separate one.

---

## Phase 5 — Observability & rollout

1. Log (info) when enforced settings are being applied to a query, at
   startup and once per request via existing tracing spans
   (`clickhouse mutate_query` already exists in `MutateQuery`). Add
   span attributes:
   - `clickhouse.enforced_settings.count`
   - `clickhouse.enforced_readonly` (bool)
   Avoid logging the enforced *values* at info level — they can encode
   tenant identity.
2. CHANGELOG entry describing:
   - The new feature and the read-only side effect.
   - The `CHANGEABLE_IN_READONLY` server-side escape hatch for tunables.
   - Explicit statement that this is a defense-in-depth layer meant to
     be combined with ClickHouse row policies using
     `getSetting('custom_x')`.
3. Feature-flag consideration: since the toggle is per datasource and
   opt-in, no Grafana feature flag is needed. Consider a boot-time log
   line summarizing enforced settings at datasource instance creation
   for auditability.
4. Migration guidance in docs: current users of the `CONST` /
   per-tenant-user pattern can migrate by removing the per-tenant users
   / `CONST` profile and enabling this feature; row policies stay the
   same.

---

## Order of PRs (suggested)

1. **PR 1 (Phase 1)** — config + docs + settings tests. No runtime
   effect.
2. **PR 2 (Phase 2 + Phase 4 unit tests)** — runtime injection and
   error mapping.
3. **PR 3 (Phase 3 + Phase 4 integration tests)** — health check,
   integration coverage, CHANGELOG.

Each PR is independently revertible. Split further if the config UI
work is large in the frontend.

---

## Out of scope for this plan

- Deriving the enforced value from Grafana user identity (per-request
  tenant resolution). The interface above accepts static enforced
  values only. Dynamic values would require an additional resolver
  hook plumbed into `MutateQuery` — feasible on top of this plan but
  best done as a follow-up once the static case is proven.
- Client-side SQL pre-parsing to reject `SETTINGS` / `SET` before the
  server sees them. Not needed; deliberately omitted to keep the
  server as the single source of enforcement truth.
- Session-based (`session_id`) implementation. Not needed; per-query
  settings are sufficient and work identically across Native and HTTP.
