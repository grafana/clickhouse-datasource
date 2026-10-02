# Contributing to ClickHouse Datasource

## Signed commits are required

> [!IMPORTANT]
> All commits must be [signed](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) (GPG, SSH, or S/MIME) to be merged into this repository. Pull requests with unsigned commits will need to be re-committed with signatures before they can be merged.

Thank you for your interest in contributing to this repository. We are glad you want to help us to improve the project and join our community. Feel free to [browse the open issues](https://github.com/grafana/clickhouse-datasource/issues). If you want more straightforward tasks to complete, [we have some](https://github.com/grafana/clickhouse-datasource/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). For more details about how you can help, please take a look at [Grafana’s Contributing Guide](https://github.com/grafana/grafana/blob/main/CONTRIBUTING.md).

## Development setup

### Getting started

Clone this repository into your local environment. The frontend code lives in the `src` folder, alongside the [plugin.json file](https://grafana.com/docs/grafana/latest/developers/plugins/metadata/). The backend Go code is in the `pkg` folder. To build this plugin refer to [Build a plugin](https://grafana.com/docs/grafana/latest/developers/plugins/)

### Running the development version

Before you can set up the plugin, you need to set up your environment by following [Set up your environment](https://grafana.com/tutorials/build-a-data-source-backend-plugin/#set-up-your-environment).

#### Compiling the backend

You can use [mage](https://github.com/magefile/mage) to compile and test the Go backend.

```sh
mage test # run all Go test cases
mage build:backend && mage reloadPlugin # builds and reloads the plugin in Grafana
```

#### Compiling the frontend

You can build and test the frontend by using `npm`:

```sh
npm run test # run all test cases
npm run dev # builds and puts the output at ./dist
```

You can also have `npm` watch for changes and automatically recompile them:

```sh
npm run watch
```

#### Running E2E tests locally

1. Install [K6](https://k6.io/docs/get-started/installation/)
2. Run `npm run test:e2e:local`

## Data Source Configuration Schema

`pkg/schema/dsconfig.json` is the **single source of truth** for the data source's
configuration surface — every field a user can set, where it is stored (`root`,
`jsonData`, `secureJsonData`), its type, validation rules and UI hints. It is consumed by
provisioning tooling, documentation and automation.

The schema format is defined and documented by [`grafana/dsconfig`](https://github.com/grafana/dsconfig/tree/main/dsconfig):

- [README](https://github.com/grafana/dsconfig/tree/main/dsconfig#readme) — concepts and a worked example for each field shape (root / jsonData / secret / array / virtual), plus current gaps and limitations.
- [`schema.md`](https://github.com/grafana/dsconfig/blob/main/dsconfig/schema.md) — full property reference.
- [`schema.json`](https://github.com/grafana/dsconfig/blob/main/dsconfig/schema.json) — the JSON Schema `dsconfig.json` validates against. It is pinned via the `$schema` key at the top of our file, so editors autocomplete from it; bump that URL when you bump `github.com/grafana/dsconfig/schema` in `go.mod`.

The rest of this section covers only what is specific to this plugin.

### Layout

| File in `pkg/schema/` | Description                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dsconfig.json`        | Source of truth — **edit this**                                                                                                    |
| `dsconfig_test.go`     | Wires the schema into the shared conformance suite; also holds `SecureKeys`                                                       |
| `models/settings.go`   | `ClickHouseSettingsJSON` — the Go struct kept in sync with the schema's `jsonData` fields, purely for conformance-testing purposes |
| `*.gen.json`           | Generated artifacts — **never hand-edit**                                                                                          |

Two field shapes in this plugin's schema map to Go in non-obvious ways:

- **Sectioned fields** — fields under the "Logs" and "Traces" settings declare `"section": "logs"` / `"section": "traces"` (a flattened dotted path, e.g. `logs.otelEnabled`) rather than a nested object schema. These map to the `Logs LogsConfig` / `Traces TracesConfig` fields on `ClickHouseSettingsJSON`, with the section's own fields (json tag = the field's `key`, not its dotted id) living on `LogsConfig`/`TracesConfig`.
- **Array item fields** (`httpHeaders`, `customSettings`, `aliasTables`) — declared as a `valueType: "array"` field whose `item.fields` entries all set `isItemField: true`. These map to a Go slice of struct (`[]HTTPHeader`, `[]CustomSetting`, `[]AliasTableEntry`), one struct field per item field.

`models.ClickHouseSettingsJSON` is separate from whatever struct(s) the backend actually
reads settings into at runtime under `pkg/plugin/`. The conformance suite only checks the
schema against `models.ClickHouseSettingsJSON`, so when a field affects real backend
behaviour, keep the runtime type in sync too — nothing will fail the build if you forget.

### Adding a new settings option

1. **Declare the field** in `pkg/schema/dsconfig.json` under `fields`:
   - A regular top-level field: add its `id` to the appropriate `groups[].fieldRefs` entry. Field ids follow the `<target>_<key>` convention, e.g. `jsonData_httpMethod`.
   - A field that belongs under "Logs" or "Traces": give it `"section": "logs"` or `"section": "traces"` instead of nesting it inside another field.
   - A field that belongs on one entry of an array setting (e.g. another custom-settings column): add it to that array field's `item.fields`, with `isItemField: true`, instead of `groups[].fieldRefs`.
2. **Add the matching Go field** to `ClickHouseSettingsJSON` (or `LogsConfig` / `TracesConfig` /
   the relevant item struct) in `pkg/schema/models/settings.go`, with a json tag equal to the
   schema `key`. This parity is enforced in both directions — a field in the schema but not the
   struct (or vice versa) fails the test suite, **including** fields tagged `backend-only` or
   `frontend-only` — those tags only describe who reads the field, not whether it needs a struct
   field. Secrets (`target: secureJsonData`) are the one true exception: they get no struct
   field, but their key must be added to `SecureKeys` in `pkg/schema/dsconfig_test.go`.
3. **Regenerate the artifacts** and commit them with your change:

   ```bash
   go generate ./pkg/schema/...
   ```

4. **Verify**:

   ```bash
   go test ./pkg/schema/...
   ```

If you add a setting that changes what a typical configuration looks like, update the
provisioning examples in `pkg/schema/dsconfig_test.go` too. Use placeholders like
`REPLACE_WITH_PASSWORD`, never real credentials.

### When the conformance suite fails

Most failures are self-explanatory from the assertion message. The three you are most
likely to hit:

- `SchemaArtifactInSync` — a `.gen.json` file has drifted. Run `go generate ./pkg/schema/...` and commit the result.
- `JSONDataMatchesStruct` / `JSONDataTypesMatchStruct` — the schema and `ClickHouseSettingsJSON` disagree on keys or types. Update whichever side is behind.
- `SecureValuesMatchLoadSettings` — the schema's `secureJsonData` fields and `SecureKeys` disagree.

## Create a pull request

Run `npm run lint` and `npm run prettier:check` to check for any style errors. Any PRs that have linter or `prettier` errors will not pass pull request CI checks. Run `npm run lint:fix && npm run prettier:write` to automatically fix linter or prettier errors.

Once you are ready to make a pull request, please read and follow [Create a pull request](https://github.com/grafana/grafana/blob/master/contribute/create-pull-request.md).

## Build a release for the ClickHouse data source plugin

You need to have commit rights to the GitHub repository to publish a release.

1. Update the version number in the `package.json` file.
2. Update the `CHANGELOG.md` by copy and pasting the relevant PRs
   from [GitHub's Release drafter interface](https://github.com/grafana/clickhouse-datasource/releases/new) or by
   running `npm run generate-release-notes`.
3. PR the changes.
4. Once merged, follow the Drone release process that you can find [here](https://github.com/grafana/integrations-team/wiki/Plugin-Release-Process#drone-release-proces
