package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
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
