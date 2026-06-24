package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	engineio "github.com/maldikhan/go.socket.io/engine.io/v4/client"
	websockettransport "github.com/maldikhan/go.socket.io/engine.io/v4/client/transport/websocket"
	socketio "github.com/maldikhan/go.socket.io/socket.io/v5/client"
)

type MessageBusEvent struct {
	ID         string         `json:"id"`
	EventName  string         `json:"eventName"`
	Payload    map[string]any `json:"payload"`
	SourceID   string         `json:"sourceId"`
	Room       string         `json:"room"`
	Timestamp  int64          `json:"timestamp,omitempty"`
	ReceivedAt string         `json:"receivedAt"`
	Severity   string         `json:"severity"`
}

type messageBusHub struct {
	mu          sync.RWMutex
	limit       int
	history     []MessageBusEvent
	subscribers map[chan MessageBusEvent]struct{}
	startOnce   sync.Once
}

var defaultMessageBusHub = newMessageBusHub(300)

func newMessageBusHub(limit int) *messageBusHub {
	if limit < 1 {
		limit = 1
	}

	return &messageBusHub{
		limit:       limit,
		history:     make([]MessageBusEvent, 0, limit),
		subscribers: make(map[chan MessageBusEvent]struct{}),
	}
}

func (h *messageBusHub) start(ctx context.Context) {
	h.startOnce.Do(func() {
		go h.run(ctx)
	})
}

func (h *messageBusHub) subscribe() ([]MessageBusEvent, <-chan MessageBusEvent, func()) {
	ch := make(chan MessageBusEvent, 64)

	h.mu.Lock()
	history := append([]MessageBusEvent(nil), h.history...)
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		if _, ok := h.subscribers[ch]; ok {
			delete(h.subscribers, ch)
			close(ch)
		}
		h.mu.Unlock()
	}

	return history, ch, cancel
}

func (h *messageBusHub) snapshot() []MessageBusEvent {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return append([]MessageBusEvent(nil), h.history...)
}

func (h *messageBusHub) publish(event MessageBusEvent) {
	h.mu.Lock()
	h.history = append(h.history, event)
	if len(h.history) > h.limit {
		h.history = append([]MessageBusEvent(nil), h.history[len(h.history)-h.limit:]...)
	}

	for ch := range h.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
	h.mu.Unlock()
}

func (h *messageBusHub) run(ctx context.Context) {
	backoff := time.Second

	for {
		if ctx.Err() != nil {
			return
		}

		if err := h.connect(ctx); err != nil {
			h.publish(newMessageBusStatusEvent("error", "error", err.Error()))
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (h *messageBusHub) connect(ctx context.Context) error {
	baseURL := messageBusBaseURL()
	if baseURL == "" {
		return fmt.Errorf("message bus url not found")
	}

	rawURL := messageBusSocketIOURLFromBase(baseURL)
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return err
	}

	logger := messageBusLogger{}
	transport, err := websockettransport.NewTransport(
		websockettransport.WithLogger(logger),
	)
	if err != nil {
		return err
	}

	engineClient, err := engineio.NewClient(
		engineio.WithURL(parsedURL),
		engineio.WithTransport(transport),
		engineio.WithLogger(logger),
	)
	if err != nil {
		return err
	}

	client, err := socketio.NewClient(
		socketio.WithEngineIOClient(engineClient),
		socketio.WithLogger(logger),
	)
	if err != nil {
		return err
	}
	defer client.Close()

	client.On("connect", func([]interface{}) {
		h.publish(newMessageBusStatusEvent("connected", "info", rawURL))
	})
	client.On("disconnect", func([]interface{}) {
		h.publish(newMessageBusStatusEvent("disconnected", "status", rawURL))
	})
	client.On("error", func(args []interface{}) {
		h.publish(newMessageBusStatusEvent("error", "error", fmt.Sprintf("%v", args)))
	})
	client.OnAny(func(eventName string, args []interface{}) {
		payload := payloadMapFromSocketIOArgs(args)
		h.publish(normalizeMessageBusEvent(eventName, payload))
	})

	if err := client.Connect(ctx); err != nil {
		return err
	}

	<-ctx.Done()
	return ctx.Err()
}

func normalizeMessageBusEvent(eventName string, payload map[string]any) MessageBusEvent {
	name := eventName
	if name == "" {
		name = stringValue(payload, "Name")
	}

	id := stringValue(payload, "Uuid")
	if id == "" {
		id = newMessageBusEventID()
	}

	return MessageBusEvent{
		ID:         id,
		EventName:  name,
		Payload:    payload,
		SourceID:   stringValue(payload, "SourceID"),
		Room:       stringValue(payload, "Room"),
		Timestamp:  int64Value(payload, "Timestamp"),
		ReceivedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Severity:   classifyMessageBusSeverity(name, payload),
	}
}

func classifyMessageBusSeverity(eventName string, payload map[string]any) string {
	props := propertiesValue(payload)

	if strings.HasSuffix(eventName, "-error") {
		return "error"
	}
	if eventName == "task:update" && strings.EqualFold(stringValue(props, "task:status"), "failed") {
		return "error"
	}

	status := strings.ToLower(stringValue(props, "status"))
	if status == "fail" || status == "error" {
		return "error"
	}

	if strings.HasSuffix(eventName, "-progress") {
		return "progress"
	}
	if strings.HasSuffix(eventName, "-begin") || strings.HasSuffix(eventName, "-end") {
		return "status"
	}

	return "info"
}

func messageBusURLFromBase(base string) string {
	return strings.TrimRight(withHTTP(strings.TrimSpace(base)), "/") + "/v2/message_bus"
}

func messageBusSocketIOURLFromBase(base string) string {
	return messageBusURLFromBase(base) + "/socket.io"
}

func messageBusBaseURL() string {
	if value := strings.TrimSpace(os.Getenv("CASAOS_MESSAGE_BUS_URL")); value != "" {
		return withHTTP(value)
	}

	data, err := os.ReadFile("/var/run/casaos/message-bus.url")
	if err != nil {
		return ""
	}
	return withHTTP(strings.TrimSpace(string(data)))
}

func newMessageBusStatusEvent(status string, severity string, message string) MessageBusEvent {
	now := time.Now().UTC()
	payload := map[string]any{
		"SourceID": "rt",
		"Name":     "rt:message-bus:status",
		"Room":     "monitor",
		"Properties": map[string]any{
			"status":  status,
			"message": message,
		},
	}

	return MessageBusEvent{
		ID:         newMessageBusEventID(),
		EventName:  "rt:message-bus:status",
		Payload:    payload,
		SourceID:   "rt",
		Room:       "monitor",
		Timestamp:  now.Unix(),
		ReceivedAt: now.Format(time.RFC3339Nano),
		Severity:   severity,
	}
}

func payloadMapFromSocketIOArgs(args []interface{}) map[string]any {
	if len(args) == 0 || args[0] == nil {
		return map[string]any{}
	}

	switch value := args[0].(type) {
	case json.RawMessage:
		return payloadMapFromJSON(value)
	case []byte:
		return payloadMapFromJSON(value)
	case string:
		return payloadMapFromJSON([]byte(value))
	case map[string]any:
		return value
	default:
		return map[string]any{"value": value}
	}
}

func payloadMapFromJSON(data []byte) map[string]any {
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return map[string]any{"raw": string(data)}
	}
	return payload
}

func propertiesValue(payload map[string]any) map[string]any {
	value, ok := payload["Properties"]
	if !ok {
		return map[string]any{}
	}

	switch typed := value.(type) {
	case map[string]any:
		return typed
	case map[string]string:
		props := make(map[string]any, len(typed))
		for key, value := range typed {
			props[key] = value
		}
		return props
	default:
		return map[string]any{}
	}
}

func stringValue(values map[string]any, key string) string {
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}

	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func int64Value(values map[string]any, key string) int64 {
	value, ok := values[key]
	if !ok || value == nil {
		return 0
	}

	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int64:
		return typed
	case float64:
		return int64(typed)
	case jsonNumber:
		got, _ := typed.Int64()
		return got
	default:
		return 0
	}
}

type jsonNumber interface {
	Int64() (int64, error)
}

func newMessageBusEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

type messageBusLogger struct{}

func (messageBusLogger) Debugf(string, ...any) {}
func (messageBusLogger) Infof(string, ...any)  {}
func (messageBusLogger) Warnf(string, ...any)  {}
func (messageBusLogger) Errorf(string, ...any) {}
