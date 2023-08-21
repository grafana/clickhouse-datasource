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

func e2eTests(cmd *cobra.Command, args []string) {
	ctx := cmd.Context()

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr), dagger.WithWorkdir(".."))
	if err != nil {
		fmt.Println("Error connecting to dagger", err)
		return
	}
	defer client.Close()

	// build CH plugin to get dist file
	buildPlugin(ctx, client)

	// run e2e tests
	fmt.Println("Starting k6 tests")
	source := client.Container().
		From("node:16-slim").
		WithDirectory("/src", client.Host().Directory("."), dagger.ContainerWithDirectoryOpts{
			Exclude: []string{"node_modules/", "ci/"},
		})
	runner := source.WithWorkdir(".")
	_, err = runner.WithExec([]string{"", "k6 run e2e/e2ek6.test.js"}).Stderr(ctx)
	if err != nil {
		fmt.Println("Error running k6 tests", err)
		return
	}
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

func TestK6(t *testing.T) {
	fmt.Println("Test starting")
	if err := runTests.Execute(); err != nil {
		fmt.Println("Error running runTests: ", err)
	}
}
