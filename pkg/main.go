package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/kentik/kentik-connect-datasource/pkg/plugin"
)

// version is set at link time by the Mage build:
//
//	-X 'main.version=3.0.0'
var version = "dev"

func main() {
	plugin.PluginVersion = version

	if err := datasource.Manage("kentik-connect-datasource", plugin.NewDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error("failed to manage kentik datasource", "error", err.Error())
		os.Exit(1)
	}
}
