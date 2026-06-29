package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestLoadServerConfig(t *testing.T) {
	t.Setenv("RT_HTTP_ADDR", ":18080")
	t.Setenv("RT_HTTPS_ADDR", ":18443")
	t.Setenv("RT_ENABLE_HTTPS", "true")
	t.Setenv("RT_CERT_FILE", "/tmp/rt.crt")
	t.Setenv("RT_KEY_FILE", "/tmp/rt.key")
	t.Setenv("RT_AUTO_SELF_SIGNED_CERT", "false")
	t.Setenv("RT_PUBLIC_HOSTS", "zima.local,10.0.0.85")
	t.Setenv("RT_STATIC_DIR", "/tmp/static")

	config := loadServerConfig()

	if config.HTTPAddr != ":18080" {
		t.Fatalf("HTTPAddr = %q, want :18080", config.HTTPAddr)
	}
	if config.HTTPSAddr != ":18443" {
		t.Fatalf("HTTPSAddr = %q, want :18443", config.HTTPSAddr)
	}
	if !config.EnableHTTPS {
		t.Fatalf("EnableHTTPS = false, want true")
	}
	if config.CertFile != "/tmp/rt.crt" {
		t.Fatalf("CertFile = %q, want /tmp/rt.crt", config.CertFile)
	}
	if config.KeyFile != "/tmp/rt.key" {
		t.Fatalf("KeyFile = %q, want /tmp/rt.key", config.KeyFile)
	}
	if config.AutoSelfSignedCert {
		t.Fatalf("AutoSelfSignedCert = true, want false")
	}
	if len(config.PublicHosts) != 2 || config.PublicHosts[0] != "zima.local" || config.PublicHosts[1] != "10.0.0.85" {
		t.Fatalf("PublicHosts = %#v, want zima.local and 10.0.0.85", config.PublicHosts)
	}
	if config.StaticDir != "/tmp/static" {
		t.Fatalf("StaticDir = %q, want /tmp/static", config.StaticDir)
	}
}

func TestEnsureTLSCertificateGeneratesFiles(t *testing.T) {
	dir := t.TempDir()
	config := serverConfig{
		CertFile:           filepath.Join(dir, "nested", "rt.crt"),
		KeyFile:            filepath.Join(dir, "nested", "rt.key"),
		AutoSelfSignedCert: true,
		PublicHosts:        []string{"zima.local", "10.0.0.85"},
	}

	if err := ensureTLSCertificate(config); err != nil {
		t.Fatalf("ensureTLSCertificate returned error: %v", err)
	}

	if info, err := os.Stat(config.CertFile); err != nil || info.Size() == 0 {
		t.Fatalf("cert file stat = (%v, %v), want non-empty file", info, err)
	}
	if info, err := os.Stat(config.KeyFile); err != nil || info.Size() == 0 {
		t.Fatalf("key file stat = (%v, %v), want non-empty file", info, err)
	}
}

func TestAppHandlerServesStaticFrontend(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>rt frontend</html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/modules/rt/index.html", nil)
	rec := httptest.NewRecorder()

	appHandler(dir).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "rt frontend") {
		t.Fatalf("body = %q, want frontend content", rec.Body.String())
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

func TestAPIHandlerMessageBusEvents(t *testing.T) {
	hub := newMessageBusHub(2)
	handler := apiHandlerWithMessageBusHub(hub)

	req := httptest.NewRequest(http.MethodGet, apiPrefix+"/message-bus/events", nil)
	ctx, cancel := context.WithCancel(req.Context())
	cancel()
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("content-type = %q, want text/event-stream", got)
	}
}

func TestClassifyMessageBusSeverity(t *testing.T) {
	tests := []struct {
		name      string
		eventName string
		payload   map[string]any
		want      string
	}{
		{
			name:      "error suffix",
			eventName: "raid:create-error",
			payload:   map[string]any{"Properties": map[string]any{"message": "failed"}},
			want:      "error",
		},
		{
			name:      "failed file task",
			eventName: "task:update",
			payload: map[string]any{
				"Properties": map[string]any{
					"task:status":  "failed",
					"task:err_msg": "copy failed",
				},
			},
			want: "error",
		},
		{
			name:      "progress suffix",
			eventName: "app:install-progress",
			payload:   map[string]any{"Properties": map[string]any{}},
			want:      "progress",
		},
		{
			name:      "begin suffix",
			eventName: "app:install-begin",
			payload:   map[string]any{"Properties": map[string]any{}},
			want:      "status",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyMessageBusSeverity(tt.eventName, tt.payload); got != tt.want {
				t.Fatalf("severity = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNormalizeMessageBusEvent(t *testing.T) {
	event := normalizeMessageBusEvent("raid:create-error", map[string]any{
		"SourceID":  "local-storage",
		"Name":      "raid:create-error",
		"Timestamp": float64(1775037726),
		"Uuid":      "event-1",
		"Room":      "event",
		"Properties": map[string]any{
			"message": "UUID check error",
		},
	})

	if event.ID != "event-1" {
		t.Fatalf("ID = %q, want event-1", event.ID)
	}
	if event.EventName != "raid:create-error" {
		t.Fatalf("EventName = %q, want raid:create-error", event.EventName)
	}
	if event.SourceID != "local-storage" {
		t.Fatalf("SourceID = %q, want local-storage", event.SourceID)
	}
	if event.Room != "event" {
		t.Fatalf("Room = %q, want event", event.Room)
	}
	if event.Timestamp != 1775037726 {
		t.Fatalf("Timestamp = %d, want 1775037726", event.Timestamp)
	}
	if event.Severity != "error" {
		t.Fatalf("Severity = %q, want error", event.Severity)
	}
}

func TestMessageBusURLFromBase(t *testing.T) {
	got := messageBusURLFromBase("http://127.0.0.1:36677/")
	want := "http://127.0.0.1:36677/v2/message_bus"

	if got != want {
		t.Fatalf("url = %q, want %q", got, want)
	}
}

func TestMessageBusSocketIOURLFromBase(t *testing.T) {
	got := messageBusSocketIOURLFromBase("127.0.0.1:36677")
	want := "http://127.0.0.1:36677/v2/message_bus/socket.io"

	if got != want {
		t.Fatalf("url = %q, want %q", got, want)
	}
}

func TestMessageBusHubHistoryLimit(t *testing.T) {
	hub := newMessageBusHub(2)

	hub.publish(MessageBusEvent{ID: "1", EventName: "one"})
	hub.publish(MessageBusEvent{ID: "2", EventName: "two"})
	hub.publish(MessageBusEvent{ID: "3", EventName: "three"})

	events := hub.snapshot()
	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2", len(events))
	}
	if events[0].ID != "2" || events[1].ID != "3" {
		t.Fatalf("events = %#v, want IDs 2 and 3", events)
	}
}
