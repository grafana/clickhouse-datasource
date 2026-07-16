# Enforcing ClickHouse server-side settings from the datasource

## Current state

Server-side settings are already configurable but **not enforced**. In
`pkg/plugin/settings.go` there is a `CustomSettings []CustomSetting` field
(a list of `{setting, value}` pairs, editable from the datasource config
UI), which in `driver.go` (lines 198–208, 237) is passed to `clickhouse-go`
as `clickhouse.Options.Settings`:

```go
customSettings := make(clickhouse.Settings)
for _, setting := range settings.CustomSettings {
    customSettings[setting.Setting] = setting.Value
}
...
opts := &clickhouse.Options{ ..., Settings: customSettings, ... }
```

Those become **per-request defaults** (HTTP query-string params or the
Native protocol's per-query settings block). A user's
`SETTINGS visible_tenants='...'` clause in their SQL — or a `SET`
statement — will still override them. So today, the datasource cannot
securely impose a variable a user can't escape.

## Can it be enforced purely from the client side?

**No, not securely.** ClickHouse deliberately keeps that responsibility
on the server. Any client-only scheme (rejecting queries that contain
`SETTINGS`/`SET`, wrapping user SQL in a subquery, stripping tokens, etc.)
is defeatable via comments, string concatenation in query variables,
macros, multi-statement, alternative clauses like `FORMAT ... SETTINGS`,
INSERT/CREATE variants, etc. Even if the parsing were airtight, the
datasource still runs queries as one DB user, so any hardened tenancy
boundary has to live in the server anyway.

## The right mechanism (server-side, already available)

ClickHouse has exactly the primitives you want:

1. **Settings constraints with `CONST` / `readonly`** — attach a
   constraint to a user or settings profile so the value cannot be
   changed by `SET` or a query-level `SETTINGS` clause. Any override
   attempt is rejected.

   SQL form:
   ```sql
   CREATE SETTINGS PROFILE tenant_t1t2
     SETTINGS custom_visible_tenants = 't1,t2' CONST
     TO grafana_user_tenant_a;
   ```

   XML form (`users.xml` / profile config):
   ```xml
   <profiles><tenant_t1t2>
     <constraints>
       <custom_visible_tenants><readonly/></custom_visible_tenants>
     </constraints>
     <custom_visible_tenants>t1,t2</custom_visible_tenants>
   </tenant_t1t2></profiles>
   ```

   Custom (user-defined) settings must be prefixed with `custom_` (or
   another prefix configured via `<custom_settings_prefixes>`).

2. **Row policies that read the setting**, so the constraint actually
   gates data:
   ```sql
   CREATE ROW POLICY tenant_filter ON events
     USING has(splitByChar(',', getSetting('custom_visible_tenants')), tenant_id)
     TO ALL;
   ```

3. Combine this with a per-tenant DB user, and point each Grafana
   datasource at that user. The datasource's existing **Custom Settings**
   field can then optionally re-send the same value (harmless — the
   server will accept a value equal to the CONST one, or you can just
   omit it because the profile supplies the default).

There is no "dictionary variable" primitive that behaves like a session
variable; `custom_*` settings + `getSetting()` in row policies / views is
the idiomatic ClickHouse pattern for this.

## Feasibility of adding stronger support in the plugin

Options, roughly in order of value:

- **Docs only (recommended, minimal work).** Add a section to
  `README.md` / `docs/` explaining the pattern above and noting that
  `CustomSettings` provides *defaults*, not enforcement. This is the
  honest answer and requires no code.
- **Small UX improvement.** Add a "Server-enforced" hint next to Custom
  Settings in the config editor UI, and optionally a per-row "readonly"
  checkbox that, when checked, does two things: (a) sends the setting as
  usual, and (b) at datasource save time issues a health-check query
  verifying the setting is `CONST` on the connecting user (e.g.
  `SELECT readonly FROM system.settings_profile_elements WHERE ...`, or
  attempt `SET name=<other>` and expect an error). This gives operators
  a signal that their server config actually enforces what they think it
  does. Feasible; ~a day of work; no security regression.
- **Best-effort client blocking.** Reject user queries that contain
  `SETTINGS`/`SET`/known keywords via a regex or a real SQL pre-parse.
  Straightforward to implement in `MutateQueryData`/`Interpolate`, but
  should be advertised as defense-in-depth only, never as a security
  boundary. Don't ship this without the server-side piece.
- **Actually enforce client-side.** Not feasible in a way that would
  survive review as a multi-tenancy control. Don't.

## Bottom line

The datasource already lets you send server-side settings; it does not
(and realistically cannot) prevent a user from overriding them in SQL.
For multi-tenant enforcement, configure the setting as `CONST` on a
ClickHouse settings profile / user and enforce access with row policies
that read it via `getSetting('custom_visible_tenants')`. On the plugin
side, the useful addition is documentation plus optionally a config-save
check that verifies the setting is truly `CONST` on the server.

---

# Follow-up: per-query `readonly=1` to avoid per-tenant DB users

Goal: avoid a dedicated DB user (or `CONST` profile) per tenant. Users
that can see multiple tenants would otherwise produce a combinatorial
explosion of profiles.

## The mechanism

ClickHouse's `readonly` values:

- `0` – full access.
- `1` – SELECT/SHOW only. **`SET` is forbidden and any `SETTINGS ...`
  clause in a query that tries to change a setting is rejected** (unless
  that setting is marked `CHANGEABLE_IN_READONLY` on the server).
- `2` – same write restrictions as `1`, but the user *can* change other
  settings per query. Not what we want.

Two hard rules that make this safe:

1. From `readonly=1` (or `2`) you cannot go back down. `readonly=0` is
   always rejected once `readonly>0`.
2. Under `readonly=1`, any `SETTINGS foo=…` / `SET foo=…` in the user's
   SQL is rejected outright.

Pattern: on every query, send
`custom_visible_tenants='t1,t2', readonly=1` as request/query-scope
settings alongside the user's SQL. When the server parses the user's
SQL, `readonly` is already `1`, so their inline `SETTINGS` / `SET` are
refused before they can take effect. `readonly` can only be increased,
so they can't turn it back off.

No persistent session needed. Works as per-query settings passed
through `clickhouse-go`'s `Options.Settings` (or
`clickhouse.WithSettings` on a query context). Pooling is fine, no
dedicated connection, no per-tenant DB user, no `CONST` profile.

## Datasource change sketch

Small and localized:

1. New config field `EnforcedSettings []{Name, Value}` (or add an
   `enforced: bool` flag to each `CustomSetting`).
2. In `driver.go`, per-request (`MutateQueryData` and the direct SQL
   path), build a settings map that always includes:
   - each enforced `{name, value}` pair
   - `"readonly": 1`
   and pass it via `clickhouse.Context(clickhouse.WithSettings(...))`
   for that query.
3. Populate the enforced value per request from wherever the tenant
   mapping lives (e.g. from a Grafana-forwarded header — the plugin
   already does header forwarding in `MutateQueryData`).

Row policies on the tables use `getSetting('custom_visible_tenants')`
exactly as before. No per-tenant users, no combinatorial profile
explosion.

## Caveats

- **All queries become read-only.** No `INSERT`/DDL through this
  datasource. Usually fine for dashboards/exploration; make it opt-in.
- **`max_execution_time`, `max_memory_usage`, etc. in the user's
  `SETTINGS` clause will start failing.** Users often add these via
  the query editor. Mitigation is server-side and generic (not per
  tenant): mark the specific tunables the operator wants to allow with
  `<changeable_in_readonly/>` in `users.xml` or
  `ALTER SETTINGS PROFILE default SETTINGS max_threads WRITABLE`. Do
  this once per cluster; doesn't scale with tenant count.
- **Do NOT mark the tenant setting `CHANGEABLE_IN_READONLY`.** If any
  operator does, the guarantee collapses. Call this out prominently in
  docs; worth a health check.
- **The connecting DB user must start at `readonly=0`.** If it's
  already `readonly=1`, the plugin can't set the tenant variable at
  all. If it's `readonly=2`, we can still set the tenant variable and
  narrow to `1` in the same settings map — ClickHouse allows
  increasing restriction.
- **Table functions.** `remote()`, `url()`, `file()`, `s3()` etc. are
  already blocked or gated by additional settings under `readonly=1`
  — good, since `remote()` could otherwise bypass row policies. Verify
  on the target CH version.
- **`SETTINGS readonly=2` in a user query.** Increases restriction,
  allowed, harmless.
- **Interaction with existing `CustomSettings`.** Same field can carry
  them; the new twist is also injecting `readonly=1`. Keep the two
  lists (enforced vs advisory) if you want to distinguish.
- **Ad-hoc `SET`/`SETTINGS` errors.** Users hitting these will get an
  error. Add a helpful message in the plugin's error mapper
  (`MutateQueryError`) so the cause is obvious.
- **Verify at connection health check.** Run a probe like
  `SELECT 1 SETTINGS custom_visible_tenants='__probe__'` and expect an
  error under `readonly=1` — surfaces mis-config early.

## Verdict

Yes — send `<enforced settings>, readonly=1` as per-query settings on
every query. The two ClickHouse invariants (readonly can only be
tightened; readonly=1 rejects per-query setting changes) give the
tamper-resistance we want, without a dedicated user per tenant or a
`CONST` profile. Cost is ~a small config field + a few lines in
`driver.go` where the settings map is built, plus documentation about
the read-only side effects and the `changeable_in_readonly` footgun.

---

## Clarification: no SQL rewriting, no ClickHouse sessions

The scheme does **not** mutate the user's SQL, and does **not** rely on
ClickHouse "sessions" (`session_id` cookies) or a dedicated pinned
connection.

### Protocol / session posture today

- The datasource supports **both Native TCP and HTTP** (user-selectable
  via `Protocol` in `settings.go`). It is not HTTP-only.
- Neither path uses ClickHouse's `session_id` mechanism. `driver.go`
  calls `clickhouse.OpenDB(opts)` and lets `database/sql` pool
  connections; nothing pins a `*sql.Conn` or sends `session_id` /
  `session_timeout`.
- `Options.Settings` is set once at pool creation, and clickhouse-go
  re-sends those settings **per query** on both protocols (query-string
  params on HTTP; the query-level settings block in the Native
  handshake for each query).

### Enforced settings ride out-of-band with the SQL

The enforced values (`custom_visible_tenants='…'`, `readonly=1`) go into
the same per-query settings channel:

- **Native**: extend the settings map on the query context via
  `clickhouse.Context(ctx, clickhouse.WithSettings(...))`, or extend the
  pool-level `Options.Settings` for static values.
- **HTTP**: same map, serialized by clickhouse-go as URL query params on
  the POST (e.g. `?readonly=1&custom_visible_tenants=t1,t2`). SQL stays
  in the request body.

The user's `RawSQL` is not edited. `MutateQuery` / `MutateQueryData`
don't need to touch it. Macro interpolation is unaffected.

### Why this matters

1. No SQL parsing/rewriting fragility — no need to worry about comments,
   string literals, `FORMAT ... SETTINGS`, trailing `SETTINGS`, multi-
   statement, etc. ClickHouse itself enforces the boundary once
   `readonly=1` is active for the query.
2. The user sees exactly the SQL they typed in Grafana's query inspector
   and in error messages. The enforced settings appear only in
   ClickHouse's `system.query_log` under `Settings`.
3. Works identically over Native and HTTP; no need to add session
   support to the plugin.

The only user-visible SQL-adjacent change is optional: mapping a
`readonly`-rejection server error to a clearer message in
`MutateQueryError`. That's an error-message improvement, not a query
rewrite.
