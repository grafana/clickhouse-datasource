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

	clickHouseAssets := buildPlugin(ctx, client)
	grafanaContainer := startGrafana(client, clickHouseAssets)

	// entries, err := clickHouseAssets.Directory("./dist").Entries(ctx)
	// if err != nil {
	// 	fmt.Println(err)
	// 	return
	// }

	// fmt.Println(entries)

	clickHouseContainer := startClickHouse(client, ctx)
	fmt.Println("Plugin built")

	// run e2e tests
	fmt.Println("Starting k6 tests")
	runk6(client, ctx, grafanaContainer, clickHouseContainer, client.Host().File("e2e/e2ek6.test.js"))
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
	backend := buildBackend(ctx, client, client.Host().Directory(".", dagger.HostDirectoryOpts{Exclude: []string{"node_modules/**", "dist/**", "provisioning/**"}}))

	frontEndDependencies := WithYarnDependencies(client, backend)
	return BuildFrontEnd(client, frontEndDependencies).Directory("./dist")
}

func buildBackend(ctx context.Context, client *dagger.Client, directory *dagger.Directory) *dagger.Container {
	container := client.
		Container().
		From("golang:1.21.0").
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

	nodeModules := client.Container().
		From("node:16.13.2").
		WithWorkdir("/src").
		WithFile("/src/package.json", packageJSON).
		WithFile("/src/yarn.lock", yarnLock).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"rm", "-rf", "/src/node_modules/@grafana/data/node_modules"}).
		Directory("/src/node_modules")

	return container.WithDirectory("node_modules", nodeModules)
}

func BuildFrontEnd(client *dagger.Client, container *dagger.Container) *dagger.Container {
	// [.config .eslintrc .git .github .gitignore .prettierrc.js .vscode CHANGELOG.md CONTRIBUTING.md DEV_GUIDE.md LICENSE Magefile.go README.md config config-secure cspell.config.json cypress-e2e dist docker-compose
	//┃  go.mod go.sum jest-runner-serial.js jest-setup.js jest.config.js node_modules package.json pkg provisioning scripts src tsconfig.json yarn.lock]

	// [.config .eslintrc .git .github .gitignore .prettierrc.js .vscode CHANGELOG.md CONTRIBUTING.md DEV_GUIDE.md LICENSE Magefile.go README.md config config-secure cspell.config.json cypress-e2e dist docker-compose
	//┃  go.mod go.sum jest-runner-serial.js jest-setup.js jest.config.js node_modules package.json pkg provisioning scripts src tsconfig.json yarn.lock]
	//return container.WithExec([]string{"yarn", "build"})
	dist := client.Container().
		From("node:16.13.2").
		WithWorkdir("/src").
		WithDirectory("/src", container.Directory(".")).
		WithExec([]string{"yarn", "build"}).
		Directory("/src/dist")

	return container.WithDirectory("dist", dist)
}

func startGrafana(client *dagger.Client, clickHouseDist *dagger.Directory) *dagger.Container {
	fmt.Println("Building Grafana")
	container := client.
		Container().
		From("grafana/grafana:latest").
		WithFile("conf/custom.ini", client.Host().File("e2e/custom.ini")).
		WithDirectory("/data/plugins/clickhouse-datasource", clickHouseDist).
		WithExec(nil).
		//WithEnvVariable("P", "./plugins"). //point to clickhouseassets directory
		WithExposedPort(3000)

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

func runk6(client *dagger.Client, ctx context.Context, grafanaContainer *dagger.Container, clickhouseContainer *dagger.Container, testFile *dagger.File) {
	value, err := client.
		Container().
		From("grafana/k6:master-with-browser").
		WithServiceBinding("clickhouse", clickhouseContainer). //dns for this? e.g. does grafana connect to localhost:9000 or "clickhouse:9000"
		WithServiceBinding("grafana", grafanaContainer).
		WithEnvVariable("K6_BROWSER_ARGS", "no-sandbox").
		WithFile("k6.test.js", testFile).
		// WithEnvVariable("K6_BROWSER_HEADLESS", "0").
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
