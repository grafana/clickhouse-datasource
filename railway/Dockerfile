# Production-style preview image for Railway PR environments.
# Builds the plugin frontend and Go backend, then bakes the resulting dist/
# into a stock Grafana image. Unlike .config/Dockerfile this has no hot reload,
# delve, or supervisord: it just serves the built plugin.

# ---- Frontend build ----------------------------------------------------------
FROM node:24.15.0-bookworm AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Backend build -----------------------------------------------------------
FROM golang:1.26-bookworm AS backend
WORKDIR /app
RUN go install github.com/magefile/mage@latest
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Builds dist/gpx_clickhouse_linux_amd64 (matches "executable": "gpx_clickhouse").
RUN mage -v build:linux

# ---- Runtime image -----------------------------------------------------------
FROM grafana/grafana-enterprise:12.4.2

ENV GF_AUTH_ANONYMOUS_ENABLED=true \
    GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
    GF_AUTH_BASIC_ENABLED=false \
    GF_DEFAULT_APP_MODE=development \
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=grafana-clickhouse-datasource

COPY --from=frontend --chown=grafana:root /app/dist /var/lib/grafana/plugins/grafana-clickhouse-datasource
COPY --from=backend --chown=grafana:root /app/dist/gpx_clickhouse_linux_amd64 /var/lib/grafana/plugins/grafana-clickhouse-datasource/
COPY --chown=grafana:root railway/provisioning /etc/grafana/provisioning
