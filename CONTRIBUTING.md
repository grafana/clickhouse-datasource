# Contributing to ClickHouse Datasource

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

You can build and test the frontend by using `yarn`:

```sh
yarn test # run all test cases
yarn dev # builds and puts the output at ./dist
```

You can also have `yarn` watch for changes and automatically recompile them:

```sh
yarn watch
```

#### Running E2E tests locally

1. Install [K6](https://k6.io/docs/get-started/installation/)
2. Run `yarn test:e2e:local`

## Create a pull request

Once you are ready to make a pull request, please read and follow [Create a pull request](https://github.com/grafana/grafana/blob/master/contribute/create-pull-request.md).

## Build a release for the ClickHouse data source plugin

You need to have commit rights to the GitHub repository to publish a release.

1. Update the version number in the `package.json` file.
2. Update the `CHANGELOG.md` by copy and pasting the relevant PRs
   from [GitHub's Release drafter interface](https://github.com/grafana/clickhouse-datasource/releases/new) or by
   running `npm run generate-release-notes`.
3. PR the changes.
4. Once merged, follow the Drone release process that you can find [here](https://github.com/grafana/integrations-team/wiki/Plugin-Release-Process#drone-release-proces
