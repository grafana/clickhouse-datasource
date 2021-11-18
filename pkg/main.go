package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-starter-datasource-backend/pkg/plugin"
	"github.com/grafana/sqlds"
)

func main() {
	ds := sqlds.NewDatasource(&plugin.Clickhouse{})
	if err := datasource.Manage("grafana-clickhouse-datasource", ds.NewDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
