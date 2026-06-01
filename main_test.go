package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAPIHandlerHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, apiPrefix+"/healthz", nil)
	rec := httptest.NewRecorder()

	apiHandler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true", body["ok"])
	}
	if body["name"] != moduleName {
		t.Fatalf("name = %v, want %s", body["name"], moduleName)
	}
}

func TestAPIHandlerLogin(t *testing.T) {
	tests := []struct {
		name   string
		method string
		body   string
		status int
	}{
		{
			name:   "valid credentials",
			method: http.MethodPost,
			body:   `{"username":"admin","password":"zimaos"}`,
			status: http.StatusOK,
		},
		{
			name:   "invalid credentials",
			method: http.MethodPost,
			body:   `{"username":"admin","password":"wrong"}`,
			status: http.StatusUnauthorized,
		},
		{
			name:   "wrong method",
			method: http.MethodGet,
			status: http.StatusMethodNotAllowed,
		},
	}

	handler := apiHandler()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, apiPrefix+"/login", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d, body: %s", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
}
