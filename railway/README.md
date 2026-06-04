# Railway PR preview environments

This directory holds the build config for [Railway](https://railway.com) PR
preview environments. When a maintainer opens a pull request, Railway builds the
ClickHouse plugin (frontend + Go backend) from that PR's branch, bakes it into a
Grafana image, and serves it at a temporary public URL. The environment is
deleted automatically when the PR is merged or closed.

Each PR gets its own isolated environment, so the plugin artifact and config are
already namespaced per PR; no storage bucket or per-PR ClickHouse is needed. The
preview Grafana points at a single shared external ClickHouse via environment
variables.

## What's in here

- [`Dockerfile`](Dockerfile) - multi-stage build: frontend (`npm run build`),
  backend (`mage build:linux`), then a stock `grafana-enterprise` image with the
  built plugin baked into `/var/lib/grafana/plugins`.
- [`provisioning/datasources/clickhouse.yml`](provisioning/datasources/clickhouse.yml) -
  provisions the ClickHouse data source from `CLICKHOUSE_*` env vars.
- [`../railway.toml`](../railway.toml) - tells Railway to build with this Dockerfile.

## One-time project setup

These steps are done once in the Railway dashboard; they are not part of the repo.

1. **Create the service.** In the base environment (e.g. `staging`), create one
   service connected to this GitHub repo. It will build using `railway.toml`.
2. **Enable PR environments.** Project Settings -> Environments -> enable PR
   Environments. Leave **Bot PR Environments OFF** (see gating below).
3. **Networking.** Service Settings -> Networking: set the target port to `3000`
   (or set the variable `GF_SERVER_HTTP_PORT=${{PORT}}`), then generate a domain.
4. **Set base-environment variables** (PR environments inherit these):

   | Variable | Example | Notes |
   | --- | --- | --- |
   | `GF_SERVER_ROOT_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Correct asset/redirect URLs per PR |
   | `CLICKHOUSE_HOST` | `clickhouse.example.com` | Shared external ClickHouse host |
   | `CLICKHOUSE_PORT` | `9440` | `9000` native / `9440` native+TLS / `8443` https |
   | `CLICKHOUSE_PROTOCOL` | `native` | `native` or `http` |
   | `CLICKHOUSE_SECURE` | `true` | `true` to use TLS |
   | `CLICKHOUSE_USERNAME` | `default` | |
   | `CLICKHOUSE_PASSWORD` | (secret) | Store as a sealed/secret variable |

## Access gating: only maintainers can spin up an environment

Preview environments build and run the PR's code with access to the
`CLICKHOUSE_PASSWORD` and other variables, so it is important that untrusted
forked PRs cannot create them. This uses Railway's native gate, no custom
workflow required:

- Railway will not deploy a PR branch from a user who is not in your workspace or
  invited to your project (with their GitHub account linked). Workspace/project
  membership is therefore the gate. See the
  [Railway PR environments docs](https://docs.railway.com/environments#pr-environments).
- Add only trusted maintainers to the Railway workspace/project, with their
  GitHub accounts linked. Their PRs auto-create previews; forked or external
  contributors' PRs do not.
- Keep **Bot PR Environments OFF** so Dependabot/Copilot/etc. cannot auto-spin
  environments.

Consequences and limits:

- The gate is per Railway workspace membership, not per GitHub repo role. To grant
  or revoke preview access, add or remove the person in Railway (and confirm their
  GitHub account is linked).
- There is no opt-in path for trusted external contributors. If that is needed
  later, replace the native gate with a label-gated GitHub Actions + Railway CLI
  workflow.

## Local sanity check

Build and run the preview image locally before relying on it in CI:

```sh
docker build -f railway/Dockerfile -t ch-preview .

docker run --rm -p 3000:3000 \
  -e CLICKHOUSE_HOST=clickhouse.example.com \
  -e CLICKHOUSE_PORT=9440 \
  -e CLICKHOUSE_PROTOCOL=native \
  -e CLICKHOUSE_SECURE=true \
  -e CLICKHOUSE_USERNAME=default \
  -e CLICKHOUSE_PASSWORD=secret \
  ch-preview
```

Then open <http://localhost:3000> and confirm the ClickHouse data source is
provisioned (Connections -> Data sources -> ClickHouse) and can query the
shared database.
