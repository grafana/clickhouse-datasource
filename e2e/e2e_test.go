package e2e_test

import (
	"context"
	"fmt"
	"log"
	"os"
	"testing"

	"dagger.io/dagger"
	"github.com/spf13/cobra"
)

var command = &cobra.Command{
	Use:   "build",
	Short: "Build a backend plugin",
	Run:   e2etests,
}

func e2etests(cmd *cobra.Command, args []string) {
	ctx := cmd.Context()

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr), dagger.WithWorkdir(".."))
	if err != nil {
		panic(err)
	}
	defer client.Close()

	//set up clickhouse docker image
	startClickHouse(client)

	entries, err := client.Host().Directory(".").Entries(ctx)
	if err != nil {
		log.Println(err)
		return
	}
	fmt.Println(entries)
	//build CH plugin to get dist file
	buildPlugin(ctx, client)

	//run grafana with CH plugin installed
	startGrafana(client)

	//run e2e tests
	source := client.Container().
		From("node:16-slim").
		WithDirectory("/src", client.Host().Directory("."), dagger.ContainerWithDirectoryOpts{
			Exclude: []string{"node_modules/", "ci/"},
		})
	runner := source.WithWorkdir("/src").WithExec([]string{"yarn", "install"})
	out, err := runner.WithExec([]string{"k6", "run", "k6 run e2e/e2ek6.test.js"}).Stderr(ctx)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)

	//check if e2e tests pass

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
		//WithExec([]string{"apt", "update"}).
		// WithExec([]string{"apt", "install", "-y", "upx"}).
		WithExec([]string{"go", "install", "github.com/magefile/mage@latest"}).
		WithExec([]string{"mage", "build:backend"})

	//print stuff
	entries, err := container.Directory(".").Entries(ctx)
	if err != nil {
		log.Println(err)
	}
	fmt.Println(entries)
	// Mockgen
	// do same stuff for mockgen
	// gen k8s controllers
	// same
	// Build
	// gobuildfiles := client.Host().Directory(".")
	// gobuild := mageBase.WithMountedDirectory(workdir, protogen.Directory(workdir)).
	// WithMountedDirectory(workdir, mockgen.Directory(workdir)).
	// WithMountedDirectory(workdir, k8s.Directory(workdir)).
	// WithExec([]string{"go", "build", "./..."})

	//_, err := gobuild.Directory("bin/").Export(ctx, "bin/")
	return container
}

func WithYarnDependencies(client *dagger.Client, container *dagger.Container) *dagger.Directory {

	nodeModules := client.Container().From("node:16.13.2").
		WithDirectory(".", client.Directory()).
		WithExec([]string{"yarn", "install", "--frozen-lockfile", "--no-progress"}).
		WithExec([]string{"yarn", "build"}).
		//WithExec([]string{"rm", "-rf", "/src/node_modules/@grafana/data/node_modules"}).
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

func TestConnect(t *testing.T) {
	fmt.Println("dasfdsafdsafd built")
	if err := command.Execute(); err != nil {
		log.Fatalln(err)
	}
}
