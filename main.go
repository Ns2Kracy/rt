package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	moduleName    = "rt"
	localVersion  = "v1.0.1"
	targetVersion = "v1.0.1"
	apiAddr       = ":49321"
	apiPrefix     = "/v2/api/rt"
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

func main() {
	registerGatewayRoutes()

	config := loadServerConfig()
	log.Fatal(serve(config, appHandler(config.StaticDir)))
}

func apiHandler() http.Handler {
	return apiHandlerWithMessageBusHub(defaultMessageBusHub)
}

func appHandler(staticDir string) http.Handler {
	mux := http.NewServeMux()
	api := apiHandler()
	mux.Handle(apiPrefix, api)
	mux.Handle(apiPrefix+"/", api)
	mux.Handle("/", frontendHandler(staticDir))
	return mux
}

func frontendHandler(staticDir string) http.Handler {
	if strings.TrimSpace(staticDir) == "" {
		return http.NotFoundHandler()
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			http.Redirect(w, r, "/modules/"+moduleName+"/index.html", http.StatusFound)
			return
		case "/modules/" + moduleName:
			http.Redirect(w, r, "/modules/"+moduleName+"/", http.StatusFound)
			return
		case "/modules/" + moduleName + "/", "/modules/" + moduleName + "/index.html":
			serveIndexFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}

		if !strings.HasPrefix(r.URL.Path, "/modules/"+moduleName+"/") {
			http.NotFound(w, r)
			return
		}

		http.StripPrefix("/modules/"+moduleName+"/", fileServer).ServeHTTP(w, r)
	})
}

func serveIndexFile(w http.ResponseWriter, r *http.Request, path string) {
	file, err := os.Open(path)
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
}

func loadServerConfig() serverConfig {
	dataDir := envString("RT_DATA_DIR", "data")
	return serverConfig{
		HTTPAddr:           envString("RT_HTTP_ADDR", apiAddr),
		HTTPSAddr:          envString("RT_HTTPS_ADDR", ":49322"),
		EnableHTTPS:        envBool("RT_ENABLE_HTTPS", false),
		CertFile:           envString("RT_CERT_FILE", filepath.Join(dataDir, "certs", moduleName+".crt")),
		KeyFile:            envString("RT_KEY_FILE", filepath.Join(dataDir, "certs", moduleName+".key")),
		AutoSelfSignedCert: envBool("RT_AUTO_SELF_SIGNED_CERT", true),
		PublicHosts:        envList("RT_PUBLIC_HOSTS"),
		StaticDir:          defaultStaticDir(),
	}
}

func defaultStaticDir() string {
	if value := strings.TrimSpace(os.Getenv("RT_STATIC_DIR")); value != "" {
		return value
	}

	candidates := []string{
		filepath.Join("web", "static"),
		filepath.Join("/usr/share/casaos/www/modules", moduleName),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
			return candidate
		}
	}
	return candidates[0]
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

func envList(name string) []string {
	parts := strings.Split(os.Getenv(name), ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
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

func ensureTLSCertificate(config serverConfig) error {
	if fileExists(config.CertFile) && fileExists(config.KeyFile) {
		return nil
	}
	if !config.AutoSelfSignedCert {
		return fmt.Errorf("tls certificate files are missing and self-signed generation is disabled")
	}
	return generateSelfSignedCertificate(config.CertFile, config.KeyFile, config.PublicHosts)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func generateSelfSignedCertificate(certFile string, keyFile string, publicHosts []string) error {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return err
	}

	dnsNames, ipAddresses := certificateHosts(publicHosts)
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName: moduleName + " self-signed",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              dnsNames,
		IPAddresses:           ipAddresses,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(certFile), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(keyFile), 0o755); err != nil {
		return err
	}

	certOut, err := os.OpenFile(certFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		_ = certOut.Close()
		return err
	}
	if err := certOut.Close(); err != nil {
		return err
	}

	keyOut, err := os.OpenFile(keyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	keyDER := x509.MarshalPKCS1PrivateKey(privateKey)
	if err := pem.Encode(keyOut, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyDER}); err != nil {
		_ = keyOut.Close()
		return err
	}
	return keyOut.Close()
}

func certificateHosts(publicHosts []string) ([]string, []net.IP) {
	hostSet := map[string]bool{
		"localhost": true,
	}
	if hostname, err := os.Hostname(); err == nil && strings.TrimSpace(hostname) != "" {
		hostSet[strings.TrimSpace(hostname)] = true
	}
	for _, host := range publicHosts {
		if value := strings.TrimSpace(host); value != "" {
			hostSet[value] = true
		}
	}

	ipSet := map[string]bool{
		"127.0.0.1": true,
		"::1":       true,
	}
	dnsNames := make([]string, 0, len(hostSet))
	for host := range hostSet {
		if ip := net.ParseIP(host); ip != nil {
			ipSet[ip.String()] = true
			continue
		}
		dnsNames = append(dnsNames, host)
	}

	ipAddresses := make([]net.IP, 0, len(ipSet))
	for value := range ipSet {
		if ip := net.ParseIP(value); ip != nil {
			ipAddresses = append(ipAddresses, ip)
		}
	}
	return dnsNames, ipAddresses
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
	if envBool("RT_SKIP_GATEWAY_REGISTRATION", false) {
		log.Printf("gateway route registration skipped: disabled by RT_SKIP_GATEWAY_REGISTRATION")
		return
	}

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
