# agents.md — grafana/clickhouse-datasource

This document is a comprehensive reference for AI coding agents (and human contributors) working in the [`grafana/clickhouse-datasource`](https://github.com/grafana/clickhouse-datasource) repository. It covers architecture, code structure, development workflow, testing, and contribution conventions.

---

## Table of Contents

1. [Repository Overview](#repository-overview)
2. [Tech Stack](#tech-stack)
3. [Repository Structure](#repository-structure)
4. [Architecture](#architecture)
   - [Backend (Go)](#backend-go)
   - [Frontend (TypeScript/React)](#frontend-typescriptreact)
   - [Data Flow](#data-flow)
5. [Backend Deep Dive](#backend-deep-dive)
   - [Entry Point](#entry-point)
   - [Plugin & Datasource](#plugin--datasource)
   - [ClickHouse Driver](#clickhouse-driver)
   - [SQL Macros](#sql-macros)
   - [Data Type Conversion](#data-type-conversion)
   - [Connection Management](#connection-management)
6. [Frontend Deep Dive](#frontend-deep-dive)
   - [Configuration Editor](#configuration-editor)
   - [Query Editor](#query-editor)
   - [Query Builder](#query-builder)
   - [Column Hints System](#column-hints-system)
   - [Ad-Hoc Filters](#ad-hoc-filters)
   - [Labels & Internationalisation](#labels--internationalisation)
7. [Query Types & Visualisation Modes](#query-types--visualisation-modes)
8. [OpenTelemetry Integration](#opentelemetry-integration)
9. [SQL Macros Reference](#sql-macros-reference)
10. [Provisioning & Configuration Reference](#provisioning--configuration-reference)
11. [Development Environment Setup](#development-environment-setup)
    - [Prerequisites](#prerequisites)
    - [Running ClickHouse Locally](#running-clickhouse-locally)
    - [Loading Test Data (MGBench)](#loading-test-data-mgbench)
    - [TLS / Secure Setup](#tls--secure-setup)
    - [Running the Plugin in Grafana](#running-the-plugin-in-grafana)
12. [Build System](#build-system)
    - [Backend Build (Mage)](#backend-build-mage)
    - [Frontend Build (npm)](#frontend-build-npm)
13. [Testing](#testing)
    - [Backend Unit Tests (Go)](#backend-unit-tests-go)
    - [Frontend Unit Tests (Jest)](#frontend-unit-tests-jest)
    - [End-to-End Tests (Playwright)](#end-to-end-tests-playwright)
    - [Integration Tests (Testcontainers)](#integration-tests-testcontainers)
14. [CI/CD](#cicd)
15. [Key Dependencies](#key-dependencies)
16. [Important Conventions & Gotchas](#important-conventions--gotchas)
17. [Feature Flags](#feature-flags)
18. [Built-in Dashboards](#built-in-dashboards)
19. [Version Compatibility](#version-compatibility)
20. [Contribution Guidelines Summary](#contribution-guidelines-summary)

---

## Repository Overview

This is the **official Grafana datasource plugin for ClickHouse**, developed and maintained by Grafana Labs in collaboration with ClickHouse. It is a **backend datasource plugin** implemented in both Go (backend) and TypeScript/React (frontend), following all Grafana plugin SDK standards.

The plugin enables Grafana users to:
- Query ClickHouse data using a raw SQL editor or a visual query builder
- Visualise data as time series, tables, logs, and distributed traces
- Use SQL macros for dynamic query generation
- Configure ad-hoc filters across dashboards
- Work natively with OpenTelemetry data stored in ClickHouse
- Set up alerts based on ClickHouse data

**Plugin ID:** `grafana-clickhouse-datasource`
**License:** Apache-2.0

---

## Tech Stack

| Layer | Language / Framework |
|---|---|
| Backend | Go, `grafana-plugin-sdk-go`, `sqlds/v5` |
| ClickHouse client | `clickhouse-go/v2` (native TCP + HTTP) |
| Frontend | TypeScript, React, `@grafana/ui`, `@grafana/data` |
| Build (backend) | [Mage](https://magefile.org/) (`Magefile.go`) |
| Build (frontend) | Node.js, npm, Webpack (via `@grafana/create-plugin`) |
| Unit tests (backend) | Go `testing` + `testify` |
| Integration tests | `testcontainers-go` (spins up real ClickHouse in Docker) |
| Unit tests (frontend) | Jest |
| E2E tests | Playwright |
| Linting (frontend) | ESLint (`eslint.config.mjs`) |
| Formatting | Prettier (`.prettierrc.js`) |
| Spell checking | cspell (`cspell.config.json`) |

---

## Repository Structure

```
clickhouse-datasource/
├── pkg/                        # Go backend
│   ├── main.go                 # Backend entry point
│   ├── plugin/
│   │   ├── datasource.go       # Core datasource implementation (sqlds)
│   │   ├── driver.go           # ClickHouse driver (clickhouse-go/v2)
│   │   ├── converters.go       # ClickHouse → Grafana type converters
│   │   └── ...
│   └── macros/
│       ├── macros.go           # SQL macro expansion logic
│       └── macros_test.go      # Macro unit tests
├── src/                        # TypeScript/React frontend
│   ├── plugin.json             # Plugin manifest
│   ├── module.ts               # Frontend entry point
│   ├── views/
│   │   ├── CHConfigEditor.tsx  # Datasource configuration UI
│   │   └── CHQueryEditor.tsx   # Query editor UI (SQL + Builder)
│   ├── components/             # Shared UI sub-components
│   ├── hooks/
│   │   └── useBuilderOptionsState.ts  # Redux-like query builder state
│   ├── data/
│   │   └── CHDatasource.ts     # Frontend datasource class
│   ├── types/                  # Shared TypeScript types
│   ├── labels.ts               # All user-facing UI strings (single source of truth)
│   ├── dashboards/             # Bundled dashboard JSON files
│   │   ├── opentelemetry-clickhouse.json
│   │   └── system-dashboards.json
│   └── img/
│       └── logo.svg
├── tests/                      # Playwright E2E tests
├── scripts/                    # Utility scripts (TLS cert generation, etc.)
│   ├── ca.sh                   # Create CA certificate
│   └── ca-cert.sh              # Create server certificate from CA
├── config/                     # ClickHouse server config (for non-TLS Docker dev)
├── config-secure/              # ClickHouse server config (for TLS Docker dev)
├── provisioning/
│   └── datasources/            # Grafana provisioning YAML examples
├── .config/                    # Grafana plugin tooling config (@grafana/create-plugin)
├── .github/                    # GitHub Actions workflows
├── Magefile.go                 # Mage build targets
├── go.mod / go.sum             # Go module dependencies
├── package.json                # Node.js dependencies and scripts
├── jest.config.js              # Jest configuration
├── jest-setup.js               # Jest global setup
├── jest-runner-serial.js       # Serial Jest runner config
├── playwright.config.ts        # Playwright configuration
├── tsconfig.json               # TypeScript configuration
├── eslint.config.mjs           # ESLint configuration
├── .prettierrc.js              # Prettier configuration
├── .nvmrc                      # Node.js version pin
├── docker-compose.yml          # Docker Compose for local dev
├── gen-db-dashboards.js        # Dashboard generation script
├── DEV_GUIDE.md                # Developer guide (local ClickHouse + TLS setup)
├── CONTRIBUTING.md             # Contribution guide
├── CHANGELOG.md                # Full changelog
└── README.md                   # User-facing documentation
```

---

## Architecture

### Backend (Go)

The backend is a standard Grafana datasource backend plugin built on top of the [`grafana-plugin-sdk-go`](https://github.com/grafana/grafana-plugin-sdk-go) and the [`sqlds`](https://github.com/grafana/sqlds) library. `sqlds` (SQL datasource) is Grafana's shared library for SQL-based backend plugins — it handles the boilerplate of query routing, connection pooling, variable interpolation, and health checks, letting the plugin focus on ClickHouse-specific concerns.

Key responsibilities of the backend:
- Managing connections to ClickHouse over Native TCP or HTTP
- Expanding SQL macros before query execution
- Converting ClickHouse column types to Grafana data frame fields
- Serving metadata (databases, tables, columns) for the query builder
- Handling ad-hoc filter injection into queries

### Frontend (TypeScript/React)

The frontend is written in TypeScript using React and Grafana's `@grafana/ui` component library. It has two top-level views:
- **`CHConfigEditor`** — the datasource configuration form
- **`CHQueryEditor`** — the query editor, which hosts both the SQL editor mode and the visual query builder mode

### Data Flow

```
User (Grafana browser)
    │
    ▼
CHQueryEditor (React)
    │  writes QueryBuilderOptions / raw SQL
    ▼
CHDatasource (TypeScript)
    │  sends query via Grafana's data source API
    ▼
[Grafana Backend]
    │  forwards to plugin process
    ▼
pkg/plugin/datasource.go (Go / sqlds)
    │  interpolates variables
    ▼
pkg/macros/macros.go
    │  expands $__timeFilter, $__interval_s, etc.
    ▼
pkg/plugin/driver.go (clickhouse-go/v2)
    │  executes query over Native TCP or HTTP
    ▼
ClickHouse Server
    │  returns rows
    ▼
pkg/plugin/converters.go
    │  maps ClickHouse types → Grafana DataFrames
    ▼
CHQueryEditor → Grafana Panel (time series / table / logs / traces)
```

---

## Backend Deep Dive

### Entry Point

**`pkg/main.go`**

Calls `datasource.Manage("grafana-clickhouse-datasource", NewDatasource, datasource.ManageOpts{})` to register the plugin with the Grafana plugin framework. This is the standard pattern for all Grafana backend plugins.

### Plugin & Datasource

**`pkg/plugin/datasource.go`**

`NewDatasource` constructs the datasource. It initialises the `sqlds.SQLDatasource` with the ClickHouse-specific driver. The `sqlds` library handles:
- Query execution routing (`QueryData`)
- Connection caching/pooling per unique settings hash
- Health check implementation (`CheckHealth`)
- Variable interpolation

### ClickHouse Driver

**`pkg/plugin/driver.go`**

Implements the `sqlds.Driver` interface for ClickHouse using `github.com/ClickHouse/clickhouse-go/v2`. Key configuration fields it reads from `jsonData`/`secureJsonData`:

| Field | Description |
|---|---|
| `host` | ClickHouse hostname |
| `port` | Port (9000 native, 8123 HTTP, 9440 native+TLS, 8443 HTTPS) |
| `username` / `password` | Authentication credentials |
| `protocol` | `native` (default) or `http` |
| `secure` | Enable TLS |
| `tlsSkipVerify` | Skip TLS certificate verification |
| `tlsAuth` / `tlsAuthWithCACert` | Mutual TLS options |
| `dialTimeout` | Connection timeout (seconds) |
| `queryTimeout` | Query timeout (seconds) |
| `defaultDatabase` | Default database to use |
| `customSettings` | Pass-through ClickHouse settings |
| `httpHeaders` | Custom HTTP headers (for HTTP protocol) |

Connection pool defaults (configurable in datasource settings):
- `MaxOpenConns`: 50
- `MaxIdleConns`: 25
- `ConnMaxLifetime`: 5 minutes

The driver supports **standard Go HTTP proxy environment variables** (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) automatically via `FromEnvironment`.

### SQL Macros

**`pkg/macros/macros.go`**

Macro expansion happens before the query is sent to ClickHouse. Macros are replaced with ClickHouse-compatible SQL expressions. See [SQL Macros Reference](#sql-macros-reference) for the full table.

Brace notation (`{__timeFilter}`) is also supported for use inside SQL parameters.

### Data Type Conversion

**`pkg/plugin/converters.go`**

Maps ClickHouse column types to Grafana `data.FieldType`. Notable mappings:
- `DateTime`, `DateTime64` → `time.Time`
- `Date`, `Date32` → `time.Time` (normalised with user timezone)
- `UInt8`–`UInt64`, `Int8`–`Int64` → corresponding Go int types
- `Float32`, `Float64` → `float64`
- `String`, `FixedString`, `LowCardinality` → `string`
- `Decimal` → `float64` (via `shopspring/decimal`)
- `Array`, `Tuple`, `Map`, `Nested` → `string` (JSON-encoded)
- `Point` (geo) → handled via `paulmach/orb`
- `Variant`, `Dynamic`, `JSON` (ClickHouse new types) → supported from v4.8+

### Connection Management

The plugin uses `sqlds`'s built-in connection caching. A connection is keyed on a hash of the datasource settings. Failed connections are automatically evicted and re-established on the next request. Connection limits are enforced to prevent overloading ClickHouse from Grafana.

---

## Frontend Deep Dive

### Configuration Editor

**`src/views/CHConfigEditor.tsx`**

Renders a form-based UI for configuring the ClickHouse datasource. Sections include:
- Server connection (host, port, protocol)
- TLS settings (CA cert, client cert, client key, skip verify)
- Authentication (username, password)
- Default database and table
- Custom HTTP headers (with optional secure storage)
- Logs configuration (default database, table, OTel mode, column mappings)
- Traces configuration (default database, table, OTel mode, duration unit, column mappings)
- Custom ClickHouse settings
- Dial and query timeouts

A redesigned config page with sidebar navigation and collapsible sections is available behind the `newClickhouseConfigPageDesign` feature flag (as of v4.10+).

### Query Editor

**`src/views/CHQueryEditor.tsx`**

The top-level query editing component. It supports two modes:
- **SQL Editor** — raw SQL with macro support and syntax highlighting
- **Builder** — visual query builder

When switching from SQL mode to Builder mode, the plugin attempts to parse the raw SQL back into `QueryBuilderOptions`. Switching from Builder to SQL generates the SQL from the current builder options.

The state of the query builder is managed via `useBuilderOptionsState` (a Redux-like hook with action dispatch).

### Query Builder

**`src/components/queryBuilder/`** (approximate path)

The visual query builder allows users to construct queries without writing SQL. It supports different query types:
- **Table** — general SELECT with filters, GROUP BY, ORDER BY, and LIMIT
- **Time Series** — enforces time column + metric value(s) pattern
- **Logs** — enforces timestamp + log message + log level + optional OTel fields
- **Traces** — enforces OTel trace schema columns

The builder generates SQL via a SQL generator that maps `QueryBuilderOptions` to a valid ClickHouse SELECT statement. It reads column metadata from the backend (databases → tables → columns with types) to populate dropdowns.

When writing queries parsed from the SQL editor back into the builder, the system re-maps columns into their correct fields for Log and Trace queries.

### Column Hints System

Column hints (`ColumnHint`) are a key internal concept that allows the SQL generator and query builder to work with semantic column roles instead of hardcoded column names. This decoupling is essential for the builder to work across different schemas.

```typescript
// A column can be given a semantic hint
const logTimeColumn: SelectedColumn = {
  name: 'my_time_column',
  hint: ColumnHint.Time,
  alias: 'logTime'
};

// ORDER BY can reference the hint instead of the column name
const orderBy: OrderBy = {
  name: '',           // empty — resolved via hint
  hint: ColumnHint.Time,
  dir: OrderByDirection.ASC
};
```

Available hints include: `ColumnHint.Time`, `ColumnHint.LogMessage`, `ColumnHint.LogLevel`, `ColumnHint.TraceId`, `ColumnHint.SpanId`, `ColumnHint.ParentSpanId`, `ColumnHint.ServiceName`, `ColumnHint.OperationName`, `ColumnHint.Duration`, `ColumnHint.Tags`, `ColumnHint.ServiceTags`, and more.

**When modifying the query builder or SQL generator, always use column hints rather than hardcoded column names wherever a semantic role is being expressed.**

### Ad-Hoc Filters

Ad-hoc filters are applied automatically to all queries using the datasource. The plugin supports two modes:

1. **Default (tuple syntax)** — uses `(column, operator, value)` format
2. **JSON syntax** — enabled by adding a dashboard constant variable named `clickhouse_adhoc_use_json` (value is ignored)

Filter targets are detected by SQL parsing the target table from the query. For queries using CTEs or complex ClickHouse-specific syntax (e.g., `INTERVAL`, aggregate functions with parameters), the automatic SQL parsing may fail and manual target table hints may be needed.

The set of filterable columns is controlled by:
- Default: all tables and columns (or all tables in `defaultDatabase` if set)
- `clickhouse_adhoc_query` constant variable: restricts to a comma-delimited list of databases, a single database, a `database.table` combination, or any valid ClickHouse query whose result is used as the filter set

Ad-hoc filters also support `Map` and `JSON` column types for OTel data.

**Requires ClickHouse 22.7+.**

### Labels & Internationalisation

All user-facing strings in the frontend are centralised in **`src/labels.ts`**. When adding new UI text, always add it to `labels.ts` first rather than inlining strings in components.

---

## Query Types & Visualisation Modes

| Query Type | Required Columns | Notes |
|---|---|---|
| Table | Any | Always available for any valid ClickHouse query |
| Time Series | `datetime` column aliased as `time` + metric value(s) | Grafana treats timestamps without timezone as UTC |
| Multi-line Time Series | `time` (DateTime), group-by field, metric value(s) | Returns ≥3 fields in that order |
| Logs | Timestamp + string values | Alias timestamp as `log_time` to default to Logs in Explore |
| Traces | OTel-compatible trace columns | Set Format to `Trace` in query editor |

For **Logs**, the required columns for rendering are: timestamp, body/message, severity/level. Grafana's `log_time` alias convention is used to auto-detect logs in Explore.

For **Traces**, the required columns follow [Grafana's trace data API](https://grafana.com/docs/grafana/latest/explore/trace-integration/#data-api): `traceID`, `spanID`, `operationName`, `parentSpanID`, `serviceName`, `duration` (in milliseconds), `startTime`, `tags` (array of maps), `serviceTags` (array of maps).

**Format override** is available in the query editor (since v2.2.0) to force a specific rendering mode regardless of column names.

---

## OpenTelemetry Integration

The plugin has first-class support for OpenTelemetry data stored in ClickHouse via the [ClickHouse OpenTelemetry Exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter).

OTel-mode can be enabled per query type (logs and traces) in both the configuration editor and the query builder. When OTel mode is on, the builder pre-maps known OTel column names (`Timestamp`, `Body`, `SeverityText`, `TraceId`, `SpanId`, `SpanName`, `ParentSpanId`, `ServiceName`, `Duration`, `SpanAttributes`, `ResourceAttributes`, `StatusCode`).

An **OpenTelemetry dashboard** is bundled with the plugin (`src/dashboards/opentelemetry-clickhouse.json`) and available from the datasource's Dashboards tab.

The plugin also ships a **ClickHouse System Dashboards** dashboard (`src/dashboards/system-dashboards.json`) that mirrors the content from `system.dashboards`.

---

## SQL Macros Reference

| Macro | Description | Example Output |
|---|---|---|
| `$__dateFilter(col)` | Date range filter (Date type) | `date >= toDate('2022-10-21') AND date <= toDate('2022-10-23')` |
| `$__timeFilter(col)` | Time range filter (DateTime, seconds) | `time >= toDateTime(1415792726) AND time <= toDateTime(1447328726)` |
| `$__timeFilter_ms(col)` | Time range filter (DateTime64, milliseconds) | `time >= fromUnixTimestamp64Milli(...) AND time <= fromUnixTimestamp64Milli(...)` |
| `$__dateTimeFilter(dateCol, timeCol)` | Combines `$__dateFilter` + `$__timeFilter` | `$__dateFilter(dateCol) AND $__timeFilter(timeCol)` |
| `$__fromTime` | Panel start time as `DateTime` | `toDateTime(1415792726)` |
| `$__toTime` | Panel end time as `DateTime` | `toDateTime(1447328726)` |
| `$__fromTime_ms` | Panel start time as `DateTime64(3)` | `fromUnixTimestamp64Milli(1415792726123)` |
| `$__toTime_ms` | Panel end time as `DateTime64(3)` | `fromUnixTimestamp64Milli(1447328726456)` |
| `$__interval_s` | Dashboard interval in seconds (min 1) | `20` |
| `$__timeInterval(col)` | `toStartOfInterval` grouping (seconds) | `toStartOfInterval(toDateTime(col), INTERVAL 20 second)` |
| `$__timeInterval_ms(col)` | `toStartOfInterval` grouping (milliseconds) | `toStartOfInterval(toDateTime64(col, 3), INTERVAL 20 millisecond)` |
| `$__conditionalAll(cond, $var)` | Returns `cond` if `$var` is not ALL, else `1=1` | `condition` or `1=1` |

Brace notation `{__macro}` is also supported for use inside SQL function parameters.

---

## Provisioning & Configuration Reference

Datasource can be provisioned via Grafana's YAML provisioning system:

```yaml
apiVersion: 1
datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    jsonData:
      defaultDatabase: database
      port: 9000
      host: localhost
      username: username
      tlsSkipVerify: false
      # tlsAuth: <bool>
      # tlsAuthWithCACert: <bool>
      # secure: <bool>
      # dialTimeout: <seconds>
      # queryTimeout: <seconds>
      # protocol: <native|http>
      # defaultTable: <string>
      # httpHeaders:
      #   - name: X-Example-Header
      #     secure: false
      #     value: <string>
      #   - name: Authorization
      #     secure: true
      # logs:
      #   defaultDatabase: <string>
      #   defaultTable: <string>
      #   otelEnabled: <bool>
      #   otelVersion: <string>
      #   timeColumn: <string>
      #   levelColumn: <string>
      #   messageColumn: <string>
      # traces:
      #   defaultDatabase: <string>
      #   defaultTable: <string>
      #   otelEnabled: <bool>
      #   otelVersion: <string>
      #   durationUnit: <seconds|milliseconds|microseconds|nanoseconds>
      #   traceIdColumn: <string>
      #   spanIdColumn: <string>
      #   operationNameColumn: <string>
      #   parentSpanIdColumn: <string>
      #   serviceNameColumn: <string>
      #   durationColumn: <string>
      #   startTimeColumn: <string>
      #   tagsColumn: <string>
      #   serviceTagsColumn: <string>
    secureJsonData:
      password: password
      # tlsCACert: <string>
      # tlsClientCert: <string>
      # tlsClientKey: <string>
      # secureHttpHeaders.Authorization: <string>
```

### ClickHouse User Requirements

The datasource user should have `readonly` permission. However, the `readonly` user **must** be able to modify `max_execution_time`. Options:

- Set `readonly=2` in the user profile (not recommended for public instances)
- Keep `readonly=1` and set `max_execution_time` constraint to `changeable_in_readonly`

---

## Development Environment Setup

### Prerequisites

- Go (version per `go.mod`)
- Node.js (version per `.nvmrc`)
- Docker + Docker Compose
- Mage (`go install github.com/magefile/mage@latest`)

### Running ClickHouse Locally

```bash
# Create a directory for ClickHouse data
mkdir -p $HOME/workspace/clickhouse/db/db

# Start ClickHouse (exposes native port 9000 and HTTP port 8123)
docker run -d \
  -p 8123:8123 -p 9000:9000 \
  --name grafana-clickhouse-server \
  --ulimit nofile=262144:262144 \
  --volume=$HOME/workspace/clickhouse/db/db:/var/lib/clickhouse \
  clickhouse/clickhouse-server

# Optional: open a CLI session
docker run -it --rm \
  --network=container:grafana-clickhouse-server \
  --entrypoint clickhouse-client \
  clickhouse/clickhouse-server
```

Minimum plugin configuration for this setup:
- Server address: `localhost`
- Server port: `9000`

### Loading Test Data (MGBench)

The repository uses the [Brown University Benchmark (MGBench)](https://clickhouse.com/docs/en/getting-started/example-datasets/brown-benchmark/) for test data.

1. Download and unpack the CSV files from the link above
2. Create the database and tables using the commands in the benchmark docs (DBeaver works well)
3. Load the data:

```bash
sudo cat $HOME/workspace/clickhouse/mgbench/mgbench1.csv | \
  docker run -i --rm --network=container:grafana-clickhouse-server \
  --entrypoint clickhouse-client clickhouse/clickhouse-server \
  -m --query="INSERT INTO mgbench.logs1 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench2.csv | \
  docker run -i --rm --network=container:grafana-clickhouse-server \
  --entrypoint clickhouse-client clickhouse/clickhouse-server \
  -m --query="INSERT INTO mgbench.logs2 FORMAT CSVWithNames"

sudo cat $HOME/workspace/clickhouse/mgbench/mgbench3.csv | \
  docker run -i --rm --network=container:grafana-clickhouse-server \
  --entrypoint clickhouse-client clickhouse/clickhouse-server \
  -m --query="INSERT INTO mgbench.logs3 FORMAT CSVWithNames"
```

### TLS / Secure Setup

For testing TLS scenarios, use the scripts in `scripts/`:

```bash
# 1. Create the CA cert
./scripts/ca.sh

# 2. Create the server cert signed by the CA (Common Name / SAN is "foo")
./scripts/ca-cert.sh

# 3. Add the hostname to /etc/hosts
echo "127.0.0.1  foo" | sudo tee -a /etc/hosts

# 4. Start ClickHouse with secure config
docker run -d \
  -p 8443:8443 -p 9440:9440 -p 9000:9000 -p 8123:8123 \
  --name secure-clickhouse-server \
  --ulimit nofile=262144:262144 \
  -v $PWD/config-secure:/etc/clickhouse-server \
  clickhouse/clickhouse-server

# 5. Trust the CA inside the container
docker exec -it secure-clickhouse-server bash
cp /etc/clickhouse-server/my-own-ca.crt /usr/local/share/ca-certificates/root.ca.crt
update-ca-certificates
```

TLS port reference:
- HTTPS: 8443
- Native + TLS: 9440

### Running the Plugin in Grafana

Use Docker Compose to spin up Grafana with the plugin:

```bash
# Build backend first
mage build:linux   # or build:darwin / build:windows

# Build frontend
npm install
npm run build

# Start the full stack
docker-compose up
```

The `docker-compose.yml` mounts the compiled plugin and sets up a ClickHouse container for integration.

---

## Build System

### Backend Build (Mage)

The `Magefile.go` defines Mage build targets, wrapping the standard `grafana-plugin-sdk-go` build tooling:

```bash
mage build:linux      # Build backend binary for Linux (amd64 + arm64)
mage build:darwin     # Build backend binary for macOS
mage build:windows    # Build backend binary for Windows
mage build:backend    # Build for current platform
mage lint             # Run Go linters
mage coverage         # Run tests with coverage
```

Backend binaries are output to `dist/` alongside the frontend bundle.

### Frontend Build (npm)

```bash
npm install           # Install dependencies
npm run build         # Production build to dist/
npm run dev           # Watch mode (development)
npm run test          # Run Jest tests (watch mode)
npm run test:ci       # Run Jest tests (single run, CI)
npm run e2e           # Run Playwright E2E tests
npm run lint          # Run ESLint
npm run typecheck     # TypeScript type checking
```

---

## Testing

### Backend Unit Tests (Go)

```bash
go test ./pkg/...

# With coverage
go test ./pkg/... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

The macro package (`pkg/macros/`) has extensive tests in `macros_test.go`. When adding or modifying macros, tests must be added.

### Frontend Unit Tests (Jest)

```bash
npm run test:ci       # Run all tests once
npm run test          # Run in watch mode
```

Jest is configured in `jest.config.js` with `jest-setup.js` as the global setup file. A serial test runner is available via `jest-runner-serial.js` for tests that cannot be parallelised.

### End-to-End Tests (Playwright)

E2E tests live in `tests/` and are configured via `playwright.config.ts`. They require a running Grafana instance with the plugin installed and a reachable ClickHouse server.

```bash
# Start the server first (spins up Grafana via Docker)
npm run server

# Run Playwright tests
npm run e2e
```

### Integration Tests (Testcontainers)

The backend uses `testcontainers-go` to spin up real ClickHouse containers for integration tests. These run as part of `go test` when Docker is available.

---

## CI/CD

CI is configured in `.github/` using GitHub Actions with `@grafana/plugin-actions` reusable workflows. The pipeline includes:

- Backend compilation (multi-platform: linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64)
- Frontend build
- Go unit tests with coverage
- Jest unit tests
- Playwright E2E tests
- ESLint / TypeScript type checking
- Plugin signing (for releases)

**Releasing:** Push a version tag in the form `vX.X.X` to trigger the release workflow. The release workflow builds, signs, and packages the plugin. Plugin signing requires a `GRAFANA_ACCESS_POLICY_TOKEN` secret in GitHub repository settings.

---

## Key Dependencies

### Go

| Package | Purpose |
|---|---|
| `github.com/grafana/grafana-plugin-sdk-go` | Grafana plugin SDK |
| `github.com/grafana/sqlds/v5` | SQL datasource base library |
| `github.com/ClickHouse/clickhouse-go/v2` | ClickHouse client (native TCP + HTTP) |
| `github.com/shopspring/decimal` | Decimal type handling |
| `github.com/paulmach/orb` | Geo / Point type support |
| `github.com/stretchr/testify` | Test assertions |
| `github.com/testcontainers/testcontainers-go` | Integration test containers |
| `github.com/docker/docker` | Docker client (for testcontainers) |
| `github.com/pkg/errors` | Error wrapping |
| `golang.org/x/net` | Net utilities |

### Node.js (Frontend)

| Package | Purpose |
|---|---|
| `@grafana/data` | Grafana data model types |
| `@grafana/ui` | Grafana UI component library |
| `@grafana/runtime` | Grafana runtime APIs |
| `@grafana/schema` | Grafana schema definitions |
| `react` / `react-dom` | UI framework |
| `@grafana/create-plugin` | Plugin build tooling |
| `@grafana/plugin-e2e` | Playwright E2E helpers |

---

## Important Conventions & Gotchas

1. **Never hardcode column names in the SQL generator.** Use `ColumnHint` values and let the generator resolve the actual column name from the selected columns list.

2. **Macros must be expanded before the query reaches ClickHouse.** The macro expansion in `pkg/macros/macros.go` runs server-side in Go, not in the browser. Do not implement new macros frontend-only.

3. **Ad-hoc filters require ClickHouse 22.7+.** Do not assume they are available and always handle the case gracefully.

4. **Queries are not validated for safety.** The plugin executes whatever SQL the user provides, including DDL. This is by design (users configure their own readonly users), but agents should not assume queries will be read-only.

5. **Grafana interprets timestamps without explicit timezone as UTC.** When converting data, ensure `DateTime` columns without timezone info are treated as UTC.

6. **Date and Date32 normalisation depends on the user's timezone setting.** This is handled in `converters.go` and must be preserved when modifying type conversion logic.

7. **`$__interval_s` has a minimum value of 1.** The macro enforces this floor to prevent division-by-zero in interval-based groupings.

8. **The `clickhouse_adhoc_query` variable** is a special dashboard constant that controls which tables/columns appear in ad-hoc filter dropdowns. Its value is either a ClickHouse query or a comma-delimited list of databases/tables.

9. **The `clickhouse_adhoc_use_json` variable** (presence-only, value ignored) switches ad-hoc filter serialisation to JSON syntax.

10. **Connection pool limits** (`MaxOpenConns: 50`, `MaxIdleConns: 25`, `ConnMaxLifetime: 5m`) are enforced by default since v4.6. These are configurable in datasource settings.

11. **All user-facing strings must go through `src/labels.ts`.** Do not inline strings directly in React components.

12. **`useBuilderOptionsState`** uses a reducer pattern. When adding new query builder fields, follow the existing dispatch/action pattern in this hook rather than managing local state in components.

13. **Backend binaries must be compiled for all target platforms** before packaging. The Mage targets handle cross-compilation.

14. **When writing SQL generator output**, ensure table names with dots (e.g., `db.table`) are properly quoted. There has been a history of quoting bugs.

15. **CTE and complex ClickHouse-specific syntax** may break ad-hoc filter auto-detection (which relies on SQL parsing to find the target table). This is a known limitation.

16. **When in doubt about how a Grafana interface works, consult the Grafana source directly.** Fetching source files from `https://raw.githubusercontent.com/grafana/grafana/main/` is the most reliable way to understand what Grafana actually does at runtime — especially for datasource interfaces, Explore features, and data frame contracts. Useful areas to look at include `packages/grafana-data/src/types/` for interface definitions, `public/app/features/explore/` for how Explore drives datasources, and `public/app/features/logs/` for logs-specific behaviour.

---

## Feature Flags

Some new features are gated behind Grafana feature toggles (Grafana 12.4.0+) or internal constants:

| Flag / Variable | Description |
|---|---|
| `newClickhouseConfigPageDesign` | Redesigned config page with sidebar navigation (v4.10+) |

Feature flags are checked at runtime using Grafana's feature toggle API. When implementing new features that need staged rollout, follow this pattern.

---

## Built-in Dashboards

The plugin ships four dashboards, available from the datasource's "Dashboards" tab:

| Dashboard | Description | Requirements |
|---|---|---|
| **Cluster Analysis** | Clusters, merges, mutations, replication overview | `system` database access |
| **Data Analysis** | Databases, tables, sizes, partitions, parts | `system` database access |
| **Query Analysis** | Query types, performance, resource consumption | `system` database access |
| **ClickHouse OTel** | OpenTelemetry logs and traces visualisation | OTel exporter schema |

Dashboards are stored as JSON in `src/dashboards/` and registered in `src/plugin.json`. The `gen-db-dashboards.js` script can regenerate system dashboards from a live ClickHouse instance.

---

## Version Compatibility

| Plugin Version | Grafana Version | Notes |
|---|---|---|
| v4.x | v9.x and above | Current major version |
| v2.2.0 | v8.x | Legacy — no longer actively developed |
| v4.x ad-hoc filters | ClickHouse 22.7+ | Ad-hoc filters require this minimum ClickHouse version |
| `row_limit` support | Grafana with `row_limit` config | Supported from v4.x |
| New Grafana feature flags | Grafana 12.4.0+ | Some features require this minimum |

---

## Contribution Guidelines Summary

1. **Fork** the repository and create a feature branch.
2. **Backend changes**: run `go test ./pkg/...` before submitting.
3. **Frontend changes**: run `npm run test:ci` and `npm run lint` before submitting.
4. **New macros**: add tests in `pkg/macros/macros_test.go`.
5. **New UI strings**: add to `src/labels.ts` first.
6. **New column types**: add conversion logic in `pkg/plugin/converters.go`.
7. **New query builder fields**: use `ColumnHint` and follow the reducer pattern in `useBuilderOptionsState`.
8. **PR description**: include the relevant issue number, a description of the change, and test evidence (screenshots for UI changes).
9. **Changelog**: add an entry to `CHANGELOG.md` in the appropriate section.
10. **Signing**: the release pipeline handles plugin signing automatically from CI; do not manually sign builds.

For detailed environment setup, refer to `DEV_GUIDE.md`. For contribution norms, refer to `CONTRIBUTING.md`.
