MODULE_NAME ?= zimaos-login-demo
GOCACHE ?= $(CURDIR)/.cache/go-build

.PHONY: test frontend build raw

test:
	bun run test

frontend:
	bun run build

build:
	mkdir -p bin
	CGO_ENABLED=0 GOCACHE=$(GOCACHE) GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/$(MODULE_NAME) .

raw:
	bash scripts/build-raw.sh
