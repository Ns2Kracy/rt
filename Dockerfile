# syntax=docker/dockerfile:1

FROM oven/bun:1 AS frontend
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM golang:1.23-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/rt .

FROM alpine:3.20
LABEL org.opencontainers.image.source="https://github.com/Ns2Kracy/rt" \
  org.opencontainers.image.description="Mod Management Playground with HTTPS recorder"

RUN apk add --no-cache ca-certificates \
  && adduser -D -H -u 10001 rt \
  && mkdir -p /app/static /data \
  && chown -R rt:rt /data

COPY --from=backend /out/rt /usr/local/bin/rt
COPY --from=frontend /src/web/static/ /app/static/

ENV RT_HTTP_ADDR=:49321 \
  RT_ENABLE_HTTPS=true \
  RT_HTTPS_ADDR=:49322 \
  RT_AUTO_SELF_SIGNED_CERT=true \
  RT_CERT_FILE=/data/certs/rt.crt \
  RT_KEY_FILE=/data/certs/rt.key \
  RT_STATIC_DIR=/app/static \
  RT_SKIP_GATEWAY_REGISTRATION=true

USER rt
VOLUME ["/data"]
EXPOSE 49321 49322
ENTRYPOINT ["/usr/local/bin/rt"]
