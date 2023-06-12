package e2e_test

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
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

	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr))
	if err != nil {
		panic(err)
	}

	//set up clickhouse docker image
	startClickHouse(client)

	//build CH plugin to get dist file

	//run grafana with CH plugin installed

	//run e2e tests

	//check if e2e tests pass

}

func startClickHouse(client *dagger.Client) {
	fmt.Println("Starting ClickHouse")
	container := client.Container().From("clickhouse/clickhouse-server:${CLICKHOUSE_VERSION-23.2-alpine}")
	_ = container.WithExec([]string{})
	fmt.Println("ClickHouse started")
}

var e embed.FS

// func buildPlugin(client *dagger.Client) {
// 	fmt.Println("Building plugin")

// 	var (
// 		grabplVersion = "2.9.51"
// 		//dockerizeVersion = "0.6.1"
// 	)

// 	log.Println("build plugin")

// 	source := client.Directory()
// 	var err error
// 	source, err = copyEmbedDir(e, source)
// 	if err != nil {
// 		panic(err)
// 	}

// 	grabpl := DownloadGrabpl(client, grabplVersion)
// 	container := client.Container().From("grafana/grafana-plugin-ci:1.7.4-alpine")

// 	container = container.
// 		WithDirectory("/src", &dagger.Directory).
// 		WithFile("/bin/grabpl", grabpl).
// 		WithWorkdir("/src")

// 	fmt.Println("Plugin built")
// 	return WithYarnDependencies(client, container).Directory("/src")
// }

func embedStuff() {
	ctx := context.Background()

	// Init Dagger client
	client, err := dagger.Connect(ctx)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	// Copy embed files to dir, a newly created directory.
	dir := client.Directory()
	dir, err = copyEmbedDir(e, dir)
	if err != nil {
		panic(err)
	}

	// Mount above directory ID and
	container := client.Container().From("alpine:3.16.2").WithDirectory("/embed", dir)

	// List files
	out, err := container.WithExec([]string{"ls", "-lR", "/embed/"}).Stdout(ctx)
	if err != nil {
		panic(err)
	}

	fmt.Printf("%s", out)
}

// create a copy of an embed directory
func copyEmbedDir(e fs.FS, dir *dagger.Directory) (*dagger.Directory, error) {
	err := fs.WalkDir(e, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		content, err := fs.ReadFile(e, path)
		if err != nil {
			return err
		}

		dir = dir.WithNewFile(path, string(content))

		return nil
	})
	if err != nil {
		return nil, err
	}
	return dir, nil
}

func startGrafana(client *dagger.Client) {
	fmt.Println("Building Grafana")
	container := client.Container().From("grafana/grafana:latest")
	container = container.Exec()
	fmt.Println("Grafana built")
}

func TestConnect(t *testing.T) {
	fmt.Println("dasfdsafdsafd built")
	embedStuff()
	if err := command.Execute(); err != nil {
		log.Fatalln(err)
	}
}
