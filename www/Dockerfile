# syntax=docker/dockerfile:1

# Multi-target Dockerfile for the Astro web frontend
#   - `dev`     → hot-reload dev server (use with `docker compose watch`)
#   - `runtime` → caddy-served static build (default)

ARG WORKDIR=/opt/relab

# --- Shared deps stage ---
FROM node:26-slim@sha256:a1d9d671994fc2d26e297ac56b4b1522a8bc7fa71c43b14cd1b1fe6c5116f7dc AS deps

ARG WORKDIR
WORKDIR $WORKDIR

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY www/package.json www/package.json
RUN npm install -g corepack@latest && corepack enable
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ./www... --prefer-offline

# --- Dev stage (hot reload) ---
FROM deps AS dev

ARG WORKDIR
WORKDIR $WORKDIR

COPY www/ www/

WORKDIR $WORKDIR/www

EXPOSE 8081

# Drop any stale dev-server lock left in the container's writable layer when
# `docker compose up` reuses/restarts a container: astro refuses to start if
# .astro/dev.json names a PID that looks alive, and a recycled PID often does.
# (astro's --force clears the content cache, it does NOT replace the lock.)
CMD ["sh", "-c", "rm -f .astro/dev.json; exec pnpm exec astro dev --port 8081 --host 0.0.0.0 --strictPort --mode dev"]

# --- Build stage (prod static build) ---
FROM deps AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV CI=1

COPY www/tsconfig.json www/astro.config.ts www/
COPY www/public/ www/public/
COPY www/src/ www/src/

ARG ENVIRONMENT=prod
ARG PUBLIC_APP_URL
ARG PUBLIC_DOCS_URL
ARG PUBLIC_SITE_URL
# Optional: base URL of the public stats API, baked into the client bundle and
# fetched from the visitor's browser at runtime. When unset or unreachable the
# stats panel simply stays hidden.
ARG PUBLIC_API_URL
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL} \
    PUBLIC_DOCS_URL=${PUBLIC_DOCS_URL} \
    PUBLIC_SITE_URL=${PUBLIC_SITE_URL} \
    PUBLIC_API_URL=${PUBLIC_API_URL}

WORKDIR $WORKDIR/www

RUN pnpm run build:${ENVIRONMENT}

# --- Runtime stage (default) ---
FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS runtime

ARG WORKDIR

# Upgrade packages to get latest security patches (Caddy image is pretty minimal, so this is low-risk).
# Relab serves Caddy on high ports, so remove the inherited low-port bind capability
# to work with no-new-privileges and dropped runtime capabilities.
RUN apk upgrade --no-cache \
    && apk add --no-cache libcap \
    && setcap -r /usr/bin/caddy \
    && apk del libcap \
    && install -d -o 1001 -g 1001 /config /data

COPY --link --from=build ${WORKDIR}/www/dist /srv
COPY --link www/Caddyfile /etc/caddy/Caddyfile

USER 1001:1001

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
