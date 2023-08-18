package e2e_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"testing"

	"dagger.io/dagger"
	"github.com/spf13/cobra"
)

var runTests = &cobra.Command{
	Use:   "test",
	Short: "run k6 tests",
	Run:   e2eTests,
}

var errorHandling = &cobra.Command{
	Use:   "error handling",
	Short: "check if k6 tests have failing tests",
	RunE: func(cmd *cobra.Command, args []string) error {
		if testFailures > 0 {
			return fmt.Errorf("Failing tests")
		}
		return nil
	},
}

var testFailures = 0

func e2eTests(cmd *cobra.Command, args []string) {
	ctx := cmd.Context()

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr), dagger.WithWorkdir(".."))
	if err != nil {
		panic(err)
	}
	defer client.Close()

	clearCache(client)

	// set up clickhouse docker image
	startClickHouse(client)

	// build CH plugin to get dist file
	buildPlugin(ctx, client)

	// run grafana with CH plugin installed
	startGrafana(client)

	// run e2e tests
	source := client.Container().
		From("node:16-slim").
		WithDirectory("/src", client.Host().Directory("."), dagger.ContainerWithDirectoryOpts{
			Exclude: []string{"node_modules/", "ci/"},
		})
	runner := source.WithWorkdir(".")
	out, err := runner.WithExec([]string{"", "k6 run e2ek6.test.js"}).Stderr(ctx)
	if err != nil {
		panic(err)
	}
	fmt.Println("out", out)

	//check if e2e tests pass
	j, _ := ioutil.ReadFile("./test_summary.json")
	type TestSummary struct {
		RootGroup struct {
			Checks []struct {
				Name   string `json:"name"`
				Passes int    `json:"passes"`
				Fails  int    `json:"fails"`
			}
		} `json:"root_group"`
	}
	var data TestSummary
	err = json.Unmarshal(j, &data)
	if err != nil {
		fmt.Println("Cannot unmarshal the json", err)
		return
	}
	for _, check := range data.RootGroup.Checks {
		if check.Fails > 0 {
			testFailures++
			fmt.Println("Test failed:", check.Name)
		} else {
			fmt.Println("Test passed:", check.Name)
		}
	}
}

func clearCache(client *dagger.Client) {
	fmt.Println("Clearing cache")
	client.Container().From("node:16.13.2").
		WithDirectory(".", client.Directory()).
		WithExec([]string{"go", "clear", "-cache"})
	fmt.Println("Cache cleared")
}

func startClickHouse(client *dagger.Client) {
	fmt.Println("Starting ClickHouse")
	container := client.Container().From("clickhouse/clickhouse-server:${CLICKHOUSE_VERSION-23.2-alpine}")
	_ = container.WithExec([]string{})
	fmt.Println("ClickHouse started")
}

func buildPlugin(ctx context.Context, client *dagger.Client) {
	fmt.Println("Building plugin")
	backend := buildBackend(ctx, client, client.Host().Directory("."))
	_ = WithYarnDependencies(client, backend)
	fmt.Println("Plugin built")

}

func buildBackend(ctx context.Context, client *dagger.Client, directory *dagger.Directory) *dagger.Container {
	container := client.
		Container().
		From("golang:1.20").
		WithWorkdir("./clickhouse-datasource").
		WithDirectory(".", directory).
		WithExec([]string{"go", "install", "github.com/magefile/mage@latest"}).
		WithExec([]string{"mage", "build:backend"})

	return container
}

func WithYarnDependencies(client *dagger.Client, container *dagger.Container) *dagger.Directory {

	nodeModules := client.Container().From("node:16.13.2").
		WithDirectory(".", client.Directory()).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"yarn", "build"}).
		Directory(".")

	return nodeModules
}

func startGrafana(client *dagger.Client) *dagger.Container {
	fmt.Println("Building Grafana")
	container := client.Container().From("grafana/grafana:latest")
	container = container.WithExec([]string{"yarn", "start"})
	fmt.Println("Grafana built")

	return container
}

func TestK6(t *testing.T) {
	fmt.Println("Test starting")
	runTests.Execute()
	errorHandling.Execute()
}
