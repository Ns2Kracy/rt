package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"strings"
)

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
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	accept := base64.StdEncoding.EncodeToString(sum[:])
	fmt.Fprintf(rw, "Sec-WebSocket-Accept: %s\r\n\r\n", accept)
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
