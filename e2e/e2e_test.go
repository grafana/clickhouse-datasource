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
var nodeVersion = "node:18.11.0"

func e2eTests(cmd *cobra.Command, args []string) {
	ctx := cmd.Context()

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr))
	if err != nil {
		fmt.Println("Error connecting to dagger", err)
		return
	}
	defer client.Close()

	clickHouseAssets := buildPlugin(ctx, client)
	clickHouseContainer := startClickHouse(client, ctx)
	grafanaContainer := startGrafana(client, clickHouseAssets, clickHouseContainer)

	fmt.Println("Plugin built")

	// run e2e tests
	fmt.Println("Starting k6 tests")
	runK6(client, ctx, grafanaContainer, client.Host().File("e2e/e2ek6.test.js"))
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
	backend := buildBackend(ctx, client)

	nodeModules := getNodeModules(client)
	return buildFrontEnd(client, nodeModules).WithDirectory(".", backend)
}

func buildBackend(ctx context.Context, client *dagger.Client) *dagger.Directory {
	var (
		host       = client.Host()
		pkg        = host.Directory("./pkg")
		goMod      = host.File("./go.mod")
		goSum      = host.File("./go.sum")
		magefile   = host.File("./Magefile.go")
		pluginJSON = host.File("./src/plugin.json")
	)

	return client.
		Container().
		From("golang:1.21.0").
		WithWorkdir("/plugin").
		WithDirectory("pkg/", pkg).
		WithFile("go.mod", goMod).
		WithFile("go.sum", goSum).
		WithFile("Magefile.go", magefile).
		WithFile("src/plugin.json", pluginJSON).
		WithExec([]string{"go", "install", "github.com/magefile/mage@latest"}).
		WithExec([]string{"mage", "build:backend"}).
		Directory("./dist")
}

func getNodeModules(client *dagger.Client) *dagger.Directory {
	var (
		host        = client.Host()
		packageJSON = host.File("package.json")
		yarnLock    = host.File("yarn.lock")
	)

	return client.Container().
		From(nodeVersion).
		WithWorkdir("./src").
		WithFile("./package.json", packageJSON).
		WithFile("./yarn.lock", yarnLock).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"rm", "-rf", "/src/node_modules/@grafana/data/node_modules"}).
		Directory("./node_modules")
}

func buildFrontEnd(client *dagger.Client, nodeModules *dagger.Directory) *dagger.Directory {
	var (
		host        = client.Host()
		src         = host.Directory("./src")
		config      = host.Directory("./.config")
		packageJSON = host.File("./package.json")
		tsConfig    = host.File("./tsconfig.json")
		readme      = host.File("./README.md")
		license     = host.File("./LICENSE")
		changelog   = host.File("./CHANGELOG.md")
		eslintrc    = host.File("./.eslintrc")
	)
	return client.Container().
		From("node:16.13.2").
		WithWorkdir("/plugin").
		WithDirectory("./src/", src).
		WithDirectory("./.config/", config).
		WithFile("./package.json", packageJSON).
		WithFile("./tsconfig.json", tsConfig).
		WithFile("./README.md", readme).
		WithFile("./LICENSE", license).
		WithFile("./CHANGELOG.md", changelog).
		WithFile("./.eslintrc", eslintrc).
		WithDirectory("./node_modules", nodeModules.Directory(".")).
		WithExec([]string{"yarn", "build"}).
		Directory("/plugin/dist")
}

func startGrafana(client *dagger.Client, clickHouseDist *dagger.Directory, clickhouseContainer *dagger.Container) *dagger.Container {
	fmt.Println("Building Grafana")
	container := client.
		Container().
		From("grafana/grafana:main").
		WithFile("/etc/grafana/grafana.ini", client.Host().File("e2e/custom.ini")).
		WithMountedDirectory("/var/lib/grafana/plugins/clickhouse-datasource", clickHouseDist).
		WithServiceBinding("clickhouse", clickhouseContainer.AsService()).
		WithExposedPort(3000)

	fmt.Println("Grafana built")

	return container
}

func startClickHouse(client *dagger.Client, ctx context.Context) *dagger.Container {
	fmt.Println("Starting ClickHouse")
	container := client.Container().
		From("clickhouse/clickhouse-server:latest-alpine").
		WithExposedPort(9000)

	fmt.Println("ClickHouse started")

	return container
}

func runK6(client *dagger.Client, ctx context.Context, grafanaContainer *dagger.Container, testFile *dagger.File) {
	value, err := client.
		Container().
		From("grafana/k6:master-with-browser").
		WithServiceBinding("grafana", grafanaContainer.AsService()).
		WithEnvVariable("K6_BROWSER_ARGS", "no-sandbox").
		WithFile("k6.test.js", testFile).
		WithExec([]string{"run", "k6.test.js"}, dagger.ContainerWithExecOpts{InsecureRootCapabilities: true}).Stderr(ctx)
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
