package main

import "log"

const (
	moduleName    = "rt"
	localVersion  = "v1.0.1"
	targetVersion = "v1.0.1"
	apiAddr       = ":49321"
	apiPrefix     = "/v2/api/rt"
)

func main() {
	registerGatewayRoutes()

	config := loadServerConfig()
	log.Fatal(serve(config, appHandler(config.StaticDir)))
}
