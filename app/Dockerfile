# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

# Multi-target Dockerfile for the Expo frontend app
#   - `dev`     → Metro dev server (use with `docker compose watch`)
#   - `runtime` → caddy-served expo web export (default)

ARG WORKDIR=/opt/relab

# --- Shared deps stage ---
FROM node:26-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS deps

ARG WORKDIR
WORKDIR $WORKDIR

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# node:26 no longer bundles corepack. A checksummed tarball, not `npm install -g`:
# the npm path cannot pin by hash.
ADD --checksum=sha256:f62535fc7be1f77e4b12cd1e420b8542b8e895cbb14178926963a41a9232a4fe \
    https://registry.npmjs.org/corepack/-/corepack-0.35.0.tgz /tmp/corepack.tgz
RUN mkdir -p /usr/local/lib/node_modules/corepack \
    && tar -xzf /tmp/corepack.tgz --strip-components=1 -C /usr/local/lib/node_modules/corepack \
    && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && rm /tmp/corepack.tgz \
    && corepack enable

COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY app/package.json app/package.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ./app... --prefer-offline

# --- Dev stage (Metro dev server) ---
FROM deps AS dev

ARG WORKDIR
WORKDIR $WORKDIR

ENV CHOKIDAR_USEPOLLING=true \
    CHOKIDAR_INTERVAL=500 \
    WATCHPACK_POLLING=true

COPY app/ app/

WORKDIR $WORKDIR/app

EXPOSE 8081

# Keep Metro's cache across restarts; use the explicit dev-clean task when we
# actually need a cold cache.
CMD ["pnpm", "exec", "expo", "start", "--port", "8081", "--web"]

# --- Build stage (expo web export) ---
FROM deps AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV CI=1

COPY app/app.json app/babel.config.js app/tsconfig.json app/metro.config.js app/postcss.config.mjs app/global.css app/
COPY app/plugins/ app/plugins/
COPY app/public/ app/public/
COPY app/src/ app/src/

ARG ENVIRONMENT=prod
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_WEBSITE_URL
ARG EXPO_PUBLIC_DOCS_URL
ENV ENVIRONMENT=${ENVIRONMENT} \
    EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} \
    EXPO_PUBLIC_WEBSITE_URL=${EXPO_PUBLIC_WEBSITE_URL} \
    EXPO_PUBLIC_DOCS_URL=${EXPO_PUBLIC_DOCS_URL}

WORKDIR $WORKDIR/app

# Expo points Metro's FileStore at $TMPDIR/metro-cache; keeping it across builds
# saves a full re-transpile. Entries are keyed by content hash and transform
# options, so dropping the `-c` (clear-cache) flag is safe.
# NOTE: BuildKit cache mounts are builder-local and do not export into
# `type=gha`, so this helps local and dev-host builds, not CI.
RUN --mount=type=cache,target=/tmp/metro-cache \
    pnpm exec expo export -p web

# --- Runtime stage (default) ---
# --- Caddy binary, stripped of its low-port capability ---
# Relab serves on high ports, so cap_net_bind_service is dead weight next to
# no-new-privileges. `setcap -r` rewrites the 48MB binary and the overlay
# copy-up leaves a second copy in the layer, so strip in a throwaway stage and
# copy onto plain Alpine. BuildKit preserves caps across COPY --from, so the
# strip must precede the copy.
FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS caddybin
RUN setcap -r /usr/bin/caddy

FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40 AS runtime

ARG WORKDIR

# ca-certificates for egress TLS, mailcap for MIME types by extension. The
# healthcheck uses busybox wget, so no curl. Upgrade keeps patches current.
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates mailcap \
    && install -d -o 65532 -g 65532 /config /data

COPY --link --from=caddybin /usr/bin/caddy /usr/bin/caddy

# Inherited from the official Caddy image, which this stage no longer uses.
ENV XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data
WORKDIR /srv
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

COPY --link --from=build ${WORKDIR}/app/dist /srv
COPY --link app/Caddyfile /etc/caddy/Caddyfile

USER 65532:65532

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
