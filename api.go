package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func apiHandler() http.Handler {
	return apiHandlerWithMessageBusHub(defaultMessageBusHub)
}

func apiHandlerWithMessageBusHub(messageBus *messageBusHub) http.Handler {
	r := chi.NewRouter()

	r.Route(apiPrefix, func(r chi.Router) {
		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, map[string]any{
				"ok":      true,
				"name":    moduleName,
				"version": localVersion,
			})
		})

		r.Get("/target-version", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, map[string]any{
				"name":           moduleName,
				"target_version": targetVersion,
			})
		})

		r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "bad json", http.StatusBadRequest)
				return
			}

			if body.Username == "admin" && body.Password == "zimaos" {
				writeJSON(w, map[string]any{
					"ok":            true,
					"message":       "login ok",
					"authorization": mask(r.Header.Get("Authorization")),
					"cookie":        mask(r.Header.Get("Cookie")),
				})
				return
			}

			http.Error(w, "bad username or password", http.StatusUnauthorized)
		})

		r.Get("/ws", handleWebSocket)
		r.Get("/message-bus/events", func(w http.ResponseWriter, r *http.Request) {
			handleMessageBusEvents(w, r, messageBus)
		})
	})

	return cors(r)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Zima-Token")
		noStore(w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}

func writeJSON(w http.ResponseWriter, v any) {
	noStore(w)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func mask(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 12 {
		return "***"
	}
	return value[:8] + "..." + value[len(value)-4:]
}
