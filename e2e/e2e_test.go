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
	pluginContainer := buildPlugin(ctx, client)

	// run e2e tests
	fmt.Println("Starting k6 tests")
	runk6(ctx, pluginContainer)
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

func buildPlugin(ctx context.Context, client *dagger.Client) *dagger.Container {
	fmt.Println("Building plugin")
	backend := buildBackend(ctx, client, client.Host().Directory("."))

	fmt.Println("Plugin built")
	return WithYarnDependencies(client, backend)
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

func WithYarnDependencies(client *dagger.Client, container *dagger.Container) *dagger.Container {

	var (
		packageJSON = container.File("package.json")
		yarnLock    = container.File("yarn.lock")
	)

	nodeModules := client.Container().From("node:16.13.2").
		WithWorkdir("/src").
		WithFile("/src/package.json", packageJSON).
		WithFile("/src/yarn.lock", yarnLock).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"rm", "-rf", "/src/node_modules/@grafana/data/node_modules"}).
		Directory("/src/node_modules")

	return container.WithDirectory("node_modules", nodeModules)
}

func runk6(ctx context.Context, container *dagger.Container) {
	value, err := container.
		From("grafana/k6:latest-with-browser").
		WithWorkdir("./clickhouse-datasource").
		WithDirectory(".", container.Directory(".")).
		WithExec([]string{"run", "e2e/e2ek6.test.js"}).Stderr(ctx)
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
