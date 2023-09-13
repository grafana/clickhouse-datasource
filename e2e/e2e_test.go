package e2e_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"dagger.io/dagger"
	"github.com/spf13/cobra"
)

var runTests = &cobra.Command{
	Use:   "test",
	Short: "run k6 tests",
	Run:   e2eTests,
	PostRunE: func(cmd *cobra.Command, args []string) error {
		if testFailures > 0 {
			return fmt.Errorf("Failing tests")
		}
		return nil
	},
}

var testFailures = 0

var platforms = []dagger.Platform{
	"linux/amd64",
}

func e2eTests(cmd *cobra.Command, args []string) {
	ctx := cmd.Context()

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr))
	if err != nil {
		fmt.Println("Error connecting to dagger", err)
		return
	}
	defer client.Close()

	for _, platform := range platforms {
		clickHouseAssets := buildPlugin(ctx, client, platform)
		grafanaContainer := startGrafana(client, clickHouseAssets, platform, ctx)
		clickHouseContainer := startClickHouse(client, ctx)
		fmt.Println("Plugin built")

		// run e2e tests
		fmt.Println("Starting k6 tests")
		runk6(client, ctx, grafanaContainer, clickHouseContainer, clickHouseAssets)
		fmt.Println("k6 tests ran")

		//check if e2e tests pass
		fmt.Println("Checking test summary")
		j, _ := os.ReadFile("test_summary.json")

		data := struct {
			RootGroup struct {
				Checks []struct {
					Name   string `json:"name"`
					Passes int    `json:"passes"`
					Fails  int    `json:"fails"`
				}
			} `json:"root_group"`
		}{}
		err = json.Unmarshal(j, &data)
		if err != nil {
			fmt.Println("Cannot unmarshal the json", err)
			return
		}
		for _, check := range data.RootGroup.Checks {
			if check.Fails > 0 {
				testFailures++
				fmt.Println("Test failed:", check.Name)
				continue
			}
			fmt.Println("Test passed:", check.Name)
		}
		fmt.Println("Test summary check complete")
	}
}

func buildPlugin(ctx context.Context, client *dagger.Client, platform dagger.Platform) *dagger.Container {
	fmt.Println("Building plugin")
	backend := buildBackend(ctx, client, client.Host().Directory(".", dagger.HostDirectoryOpts{Exclude: []string{"node_modules/**", "dist/**", "provisioning/**"}}), platform)

	return WithYarnDependencies(client, backend, platform)
}

func buildBackend(ctx context.Context, client *dagger.Client, directory *dagger.Directory, platform dagger.Platform) *dagger.Container {
	container := client.
		Container(dagger.ContainerOpts{Platform: platform}).
		From("golang:1.21.0").
		WithWorkdir("./clickhouse-datasource").
		WithDirectory(".", directory).
		WithExec([]string{"go", "install", "github.com/magefile/mage@latest"}).
		WithExec([]string{"mage", "build:backend"})

	return container
}

func WithYarnDependencies(client *dagger.Client, container *dagger.Container, platform dagger.Platform) *dagger.Container {

	var (
		packageJSON = container.File("package.json")
		yarnLock    = container.File("yarn.lock")
	)

	nodeModules := client.Container(dagger.ContainerOpts{Platform: platform}).
		From("node:16.13.2").
		WithWorkdir("/src").
		WithFile("/src/package.json", packageJSON).
		WithFile("/src/yarn.lock", yarnLock).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"rm", "-rf", "/src/node_modules/@grafana/data/node_modules"}).
		Directory("/src/node_modules")

	return container.WithDirectory("node_modules", nodeModules)
}

func startGrafana(client *dagger.Client, clickHouseAssets *dagger.Container, platform dagger.Platform, ctx context.Context) *dagger.Container {
	fmt.Println("Building Grafana")
	container := client.
		Container(dagger.ContainerOpts{Platform: platform}).
		From("grafana/grafana:latest").
		WithFile("grafana/conf/custom.ini", client.Host().File("e2e/custom.ini")).
		WithDirectory("/data/plugins", clickHouseAssets.Directory(".")).
		WithExec(nil).
		//WithEnvVariable("P", "./plugins"). //point to clickhouseassets directory
		WithExposedPort(3000)

	// entries, err := container.Directory(".").Entries(ctx)
	// if err != nil {
	// 	log.Println(err)
	// }

	// fmt.Println(entries)

	fmt.Println("Grafana built")

	return container
}

func startClickHouse(client *dagger.Client, ctx context.Context) *dagger.Container {
	fmt.Println("Starting ClickHouse")
	container := client.Container().
		From("clickhouse/clickhouse-server:latest-alpine").
		WithExec(nil).
		WithExposedPort(9000)

	fmt.Println("ClickHouse started")

	return container
}

func runk6(client *dagger.Client, ctx context.Context, grafanaContainer *dagger.Container, clickhouseContainer *dagger.Container, clickHouseAssets *dagger.Container) {
	value, err := client.
		Container().
		From("grafana/k6:master-with-browser").
		WithServiceBinding("clickhouse", clickhouseContainer). //dns for this? e.g. does grafana connect to localhost:9000 or "clickhouse:9000"
		WithServiceBinding("grafana", grafanaContainer).
		WithDirectory(".", clickHouseAssets.Directory(".")).
		WithEnvVariable("K6_BROWSER_ARGS", "no-sandbox").
		// WithEnvVariable("K6_BROWSER_HEADLESS", "0").
		WithExec([]string{"run", "e2e/e2ek6.test.js"}, dagger.ContainerWithExecOpts{InsecureRootCapabilities: true}).Stderr(ctx)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(value)
}

func TestK6(t *testing.T) {
	fmt.Println("Test starting")
	if err := runTests.Execute(); err != nil {
		fmt.Println("Error running runTests: ", err)
	}
}
