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

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr))
	if err != nil {
		fmt.Println("Error connecting to dagger", err)
		return
	}
	defer client.Close()

	// build CH plugin to get dist file
	gibberish := buildPlugin(ctx, client)

	// run e2e tests
	fmt.Println("Starting k6 tests")
	runk6(ctx, client, gibberish)
	// source := client.Container()
	// runner := source.WithWorkdir("/src")
	// _, err = runner.WithExec([]string{"k6", "run", "e2e/e2ek6.test.js"}).Stderr(ctx)
	// if err != nil {
	// 	fmt.Println("Error running k6 tests", err)
	// 	return
	// }
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

func buildPlugin(ctx context.Context, client *dagger.Client) *dagger.Directory {
	fmt.Println("Building plugin")
	backend := buildBackend(ctx, client, client.Host().Directory("."))
	nodeModules := WithYarnDependencies(client, backend)
	//_ = Withk6(client, backend)
	fmt.Println("Plugin built")
	return nodeModules
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

	nodeModules := client.Container().
		WithDirectory(".", client.Directory()).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"yarn", "build"}).
		Directory(".")

	return nodeModules
}

// func Withk6(client *dagger.Client, container *dagger.Container) *dagger.Directory {

// 	k6Browser := client.Container().
// 		WithDirectory(".", client.Directory()).
// 		WithExec([]string{"go", "install", "github.com/grafana/k6:master-with-browser"}).
// 		Directory(".")

// 	return k6Browser
// }

func runk6(ctx context.Context, client *dagger.Client, directory *dagger.Directory) {
	value, err := client.Container().
		From("grafana/k6:master-with-browser").
		WithDirectory(".", directory).
		WithExec([]string{"k6", "run", "e2e/e2ek6.test.js"}).Stderr(ctx)
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
