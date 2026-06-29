package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func appHandler(staticDir string) http.Handler {
	mux := http.NewServeMux()
	api := apiHandler()
	mux.Handle(apiPrefix, api)
	mux.Handle(apiPrefix+"/", api)

	if strings.TrimSpace(staticDir) == "" {
		mux.Handle("/", http.NotFoundHandler())
		return mux
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			http.Redirect(w, r, "/modules/"+moduleName+"/index.html", http.StatusFound)
			return
		case "/modules/" + moduleName:
			http.Redirect(w, r, "/modules/"+moduleName+"/", http.StatusFound)
			return
		case "/modules/" + moduleName + "/", "/modules/" + moduleName + "/index.html":
			file, err := os.Open(filepath.Join(staticDir, "index.html"))
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer file.Close()

			info, err := file.Stat()
			if err != nil || info.IsDir() {
				http.NotFound(w, r)
				return
			}

			http.ServeContent(w, r, "index.html", info.ModTime(), file)
			return
		}

		if !strings.HasPrefix(r.URL.Path, "/modules/"+moduleName+"/") {
			http.NotFound(w, r)
			return
		}

		http.StripPrefix("/modules/"+moduleName+"/", fileServer).ServeHTTP(w, r)
	}))
	return mux
}

func serve(config serverConfig, handler http.Handler) error {
	errs := make(chan error, 2)
	listeners := 0

	if strings.TrimSpace(config.HTTPAddr) != "" {
		listeners++
		go func() {
			log.Printf("http listening on %s", config.HTTPAddr)
			errs <- http.ListenAndServe(config.HTTPAddr, handler)
		}()
	}

	if config.EnableHTTPS {
		if err := ensureTLSCertificate(config); err != nil {
			return err
		}

		listeners++
		go func() {
			server := http.Server{
				Addr:      config.HTTPSAddr,
				Handler:   handler,
				TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12},
			}
			log.Printf("https listening on %s", config.HTTPSAddr)
			errs <- server.ListenAndServeTLS(config.CertFile, config.KeyFile)
		}()
	}

	if listeners == 0 {
		return fmt.Errorf("no http or https listener configured")
	}
	return <-errs
}
