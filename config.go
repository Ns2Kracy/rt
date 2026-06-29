package main

import (
	"os"
	"path/filepath"
	"strings"
)

type serverConfig struct {
	HTTPAddr           string
	HTTPSAddr          string
	EnableHTTPS        bool
	CertFile           string
	KeyFile            string
	AutoSelfSignedCert bool
	PublicHosts        []string
	StaticDir          string
}

func loadServerConfig() serverConfig {
	dataDir := envString("RT_DATA_DIR", "data")
	staticDir := strings.TrimSpace(os.Getenv("RT_STATIC_DIR"))
	if staticDir == "" {
		candidates := []string{
			filepath.Join("web", "static"),
			filepath.Join("/usr/share/casaos/www/modules", moduleName),
		}
		staticDir = candidates[0]
		for _, candidate := range candidates {
			if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
				staticDir = candidate
				break
			}
		}
	}

	publicHosts := []string{}
	for _, part := range strings.Split(os.Getenv("RT_PUBLIC_HOSTS"), ",") {
		if value := strings.TrimSpace(part); value != "" {
			publicHosts = append(publicHosts, value)
		}
	}

	return serverConfig{
		HTTPAddr:           envString("RT_HTTP_ADDR", apiAddr),
		HTTPSAddr:          envString("RT_HTTPS_ADDR", ":49322"),
		EnableHTTPS:        envBool("RT_ENABLE_HTTPS", false),
		CertFile:           envString("RT_CERT_FILE", filepath.Join(dataDir, "certs", moduleName+".crt")),
		KeyFile:            envString("RT_KEY_FILE", filepath.Join(dataDir, "certs", moduleName+".key")),
		AutoSelfSignedCert: envBool("RT_AUTO_SELF_SIGNED_CERT", true),
		PublicHosts:        publicHosts,
		StaticDir:          staticDir,
	}
}

func envString(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envBool(name string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if value == "" {
		return fallback
	}
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func withHTTP(value string) string {
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}
	return "http://" + value
}
