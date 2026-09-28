# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

# Dev image for the Astro web frontend: the hot-reload dev server (use with `docker compose
# watch`). The production build deploys to Cloudflare Workers (deploy-sites.yml), not
# as an image.

ARG WORKDIR=/opt/relab

# --- Shared deps stage ---
FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS deps

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
COPY www/package.json www/package.json
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
CMD ["sh", "-c", "rm -f .astro/dev.json; exec pnpm exec astro dev --port 8081 --host 0.0.0.0 --strictPort"]
