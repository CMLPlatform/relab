# syntax=docker/dockerfile:1.10

FROM node:22-bookworm-slim@sha256:ef5d50c59a5eed0fa793b8390a88a298f30e438f56ce4488d9d8df7f93e7abdf AS build
WORKDIR /opt/relab/docs

ENV CI=1

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ARG BUILD_MODE=prod
ARG PUBLIC_SITE_URL
ENV BUILD_MODE=${BUILD_MODE}
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}

RUN pnpm run build:${BUILD_MODE}

FROM caddy:2-alpine@sha256:fce4f15aad23222c0ac78a1220adf63bae7b94355d5ea28eee53910624acedfa

COPY --link --from=build /opt/relab/docs/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/health || exit 1
