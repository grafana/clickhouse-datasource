package main

import (
	"os"

	"github.com/grafana/clickhouse-datasource/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/sqlds"
)

func main() {
	if err := datasource.Manage("grafana-clickhouse-datasource", newDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}

func newDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	ds := sqlds.NewDatasource(&plugin.Clickhouse{})
	return ds.NewDatasource(settings)
}
