package main

import (
	"bufio"
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	moduleName    = "zimaos-login-demo"
	localVersion  = "v1.0.0"
	targetVersion = "v1.0.1"
	apiAddr       = ":49321"
	apiPrefix     = "/v2/api/rt"
)

func main() {
	registerGatewayRoutes()

	log.Printf("api listening on %s", apiAddr)
	log.Fatal(http.ListenAndServe(apiAddr, apiHandler()))
}

func apiHandler() http.Handler {
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

		r.Get("/auth-probe", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, map[string]any{
				"origin":        r.Header.Get("Origin"),
				"authorization": mask(r.Header.Get("Authorization")),
				"cookie":        mask(r.Header.Get("Cookie")),
				"x_zima_token":  mask(r.Header.Get("X-Zima-Token")),
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
	})

	return cors(r)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "websocket upgrade required", http.StatusBadRequest)
		return
	}

	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "missing websocket key", http.StatusBadRequest)
		return
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "websocket unsupported", http.StatusInternalServerError)
		return
	}

	conn, rw, err := hijacker.Hijack()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\n")
	fmt.Fprintf(rw, "Upgrade: websocket\r\n")
	fmt.Fprintf(rw, "Connection: Upgrade\r\n")
	fmt.Fprintf(rw, "Sec-WebSocket-Accept: %s\r\n\r\n", websocketAccept(key))
	if err := rw.Flush(); err != nil {
		return
	}

	hello := fmt.Sprintf(
		"ws connected origin=%s cookie=%s query_token=%s",
		r.Header.Get("Origin"),
		mask(r.Header.Get("Cookie")),
		mask(r.URL.Query().Get("token")),
	)
	_ = writeWebSocketFrame(rw.Writer, 0x1, []byte(hello))

	for {
		opcode, payload, err := readWebSocketFrame(rw.Reader)
		if err != nil {
			return
		}

		switch opcode {
		case 0x1:
			_ = writeWebSocketFrame(rw.Writer, 0x1, []byte("echo: "+string(payload)))
		case 0x8:
			_ = writeWebSocketFrame(rw.Writer, 0x8, nil)
			return
		case 0x9:
			_ = writeWebSocketFrame(rw.Writer, 0xA, payload)
		}
	}
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func readWebSocketFrame(r *bufio.Reader) (byte, []byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(r, header); err != nil {
		return 0, nil, err
	}

	opcode := header[0] & 0x0F
	masked := header[1]&0x80 != 0
	size := uint64(header[1] & 0x7F)

	switch size {
	case 126:
		extended := make([]byte, 2)
		if _, err := io.ReadFull(r, extended); err != nil {
			return 0, nil, err
		}
		size = uint64(binary.BigEndian.Uint16(extended))
	case 127:
		extended := make([]byte, 8)
		if _, err := io.ReadFull(r, extended); err != nil {
			return 0, nil, err
		}
		size = binary.BigEndian.Uint64(extended)
	}

	if size > 1<<20 {
		return 0, nil, fmt.Errorf("websocket frame too large")
	}

	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(r, maskKey[:]); err != nil {
			return 0, nil, err
		}
	}

	payload := make([]byte, size)
	if _, err := io.ReadFull(r, payload); err != nil {
		return 0, nil, err
	}

	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}

	return opcode, payload, nil
}

func writeWebSocketFrame(w *bufio.Writer, opcode byte, payload []byte) error {
	if err := w.WriteByte(0x80 | opcode); err != nil {
		return err
	}

	size := len(payload)
	switch {
	case size < 126:
		if err := w.WriteByte(byte(size)); err != nil {
			return err
		}
	case size <= 65535:
		if err := w.WriteByte(126); err != nil {
			return err
		}
		var b [2]byte
		binary.BigEndian.PutUint16(b[:], uint16(size))
		if _, err := w.Write(b[:]); err != nil {
			return err
		}
	default:
		if err := w.WriteByte(127); err != nil {
			return err
		}
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(size))
		if _, err := w.Write(b[:]); err != nil {
			return err
		}
	}

	if _, err := w.Write(payload); err != nil {
		return err
	}
	return w.Flush()
}

func registerGatewayRoutes() {
	var managementURL string
	for i := 0; i < 10; i++ {
		managementURL = gatewayManagementURL()
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
		if err := createGatewayRoute(managementURL, route); err != nil {
			log.Printf("gateway route %s registration failed: %v", route.Path, err)
			continue
		}
		log.Printf("gateway route registered: %s -> %s", route.Path, route.Target)
	}
}

func gatewayManagementURL() string {
	if value := strings.TrimSpace(os.Getenv("CASAOS_GATEWAY_MANAGEMENT_URL")); value != "" {
		return withHTTP(value)
	}

	data, err := os.ReadFile("/var/run/casaos/management.url")
	if err != nil {
		return ""
	}
	return withHTTP(strings.TrimSpace(string(data)))
}

func withHTTP(value string) string {
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}
	return "http://" + value
}

func createGatewayRoute(managementURL string, route any) error {
	body, err := json.Marshal(route)
	if err != nil {
		return err
	}

	url := strings.TrimRight(managementURL, "/") + "/v1/gateway/routes"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gateway returned %s", resp.Status)
	}
	return nil
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
