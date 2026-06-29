package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func registerGatewayRoutes() {
	if envBool("RT_SKIP_GATEWAY_REGISTRATION", false) {
		log.Printf("gateway route registration skipped: disabled by RT_SKIP_GATEWAY_REGISTRATION")
		return
	}

	var managementURL string
	for i := 0; i < 10; i++ {
		if value := strings.TrimSpace(os.Getenv("CASAOS_GATEWAY_MANAGEMENT_URL")); value != "" {
			managementURL = withHTTP(value)
		} else if data, err := os.ReadFile("/var/run/casaos/management.url"); err == nil {
			managementURL = withHTTP(strings.TrimSpace(string(data)))
		}

		if managementURL != "" {
			break
		}
		time.Sleep(time.Second)
	}

	if managementURL == "" {
		log.Printf("gateway route registration skipped: management url not found")
		return
	}

	routes := []struct {
		Path   string `json:"path"`
		Target string `json:"target"`
	}{
		{Path: apiPrefix, Target: "http://127.0.0.1" + apiAddr},
	}

	for _, route := range routes {
		body, err := json.Marshal(route)
		if err != nil {
			log.Printf("gateway route %s registration failed: %v", route.Path, err)
			continue
		}

		url := strings.TrimRight(managementURL, "/") + "/v1/gateway/routes"
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			log.Printf("gateway route %s registration failed: %v", route.Path, err)
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		client := http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("gateway route %s registration failed: %v", route.Path, err)
			continue
		}
		status := resp.Status
		ok := resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK
		_ = resp.Body.Close()

		if !ok {
			log.Printf("gateway route %s registration failed: gateway returned %s", route.Path, status)
			continue
		}
		log.Printf("gateway route registered: %s -> %s", route.Path, route.Target)
	}
}
