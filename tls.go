package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func ensureTLSCertificate(config serverConfig) error {
	certInfo, certErr := os.Stat(config.CertFile)
	keyInfo, keyErr := os.Stat(config.KeyFile)
	if certErr == nil && keyErr == nil && !certInfo.IsDir() && !keyInfo.IsDir() {
		return nil
	}
	if !config.AutoSelfSignedCert {
		return fmt.Errorf("tls certificate files are missing and self-signed generation is disabled")
	}

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return err
	}

	hostSet := map[string]bool{
		"localhost": true,
	}
	if hostname, err := os.Hostname(); err == nil && strings.TrimSpace(hostname) != "" {
		hostSet[strings.TrimSpace(hostname)] = true
	}
	for _, host := range config.PublicHosts {
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

	if err := os.MkdirAll(filepath.Dir(config.CertFile), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(config.KeyFile), 0o755); err != nil {
		return err
	}

	certOut, err := os.OpenFile(config.CertFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
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

	keyOut, err := os.OpenFile(config.KeyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
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
