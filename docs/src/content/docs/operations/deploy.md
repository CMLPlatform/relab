---
title: Deploy
description: Publish the images, start the stack, and verify a production or staging host.
---

These steps run on a host you [configured](/operations/configure/).

1. Publish the images.

   The hosts pull their images from GHCR instead of building them, and Cloudflare Workers serve
   the landing page and docs. The backend images work for any deployment. The app, landing page,
   and docs bake their public URLs in at build time, so a deployment on another domain publishes
   its own from a fork:

   - In the fork's settings, create a GitHub Environment named `prod` (and `staging` if you run
     one) with the variables `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL` and
     `DOCS_PUBLIC_URL`, plus the optional `FEATURED_PRODUCT_ID` for the landing page hero. If you
     run `infra/cloudflare` for your edge, it creates the Environment and the four URLs for you,
     along with the Worker names and your Cloudflare account ID.
   - Add a `CLOUDFLARE_API_TOKEN` secret to each Environment: an account API token with
     **Workers Scripts: Edit** and nothing else. A token granted on all Workers is not scoped to one
     environment, so give both Environments a required reviewer (`infra/cloudflare` does, and
     refuses to apply without one). In prod the reviewer is also the release gate.
   - Run the Deploy Sites workflow for each environment before the `infra/cloudflare` apply that
     gives the Workers their hostnames; `infra/cloudflare/README.md` lists the order.
   - Without Cloudflare, `pnpm run build` in `www/` and `docs/` gives a static `dist/` for any
     static host. Its security headers are in `dist/_headers`, which your host has to apply.
   - Run the Publish Images workflow. A manual run publishes the commit as `sha-<short sha>`; a
     release published by `release.yml` uses its version (`0.4.0`).
   - Make the packages public in the fork's package settings, or log the host in to GHCR.
   - Set `IMAGE_REGISTRY=ghcr.io/<your-account>` in `.env`, then pull the tag:

   ```bash
   just stack prod tag YES <tag>   # pulls every image, then writes IMAGE_TAG to .env
   ```

   To check first that the tag was built by your fork's workflow, run
   `GITHUB_REPOSITORY=<your-account>/relab IMAGE_REGISTRY=ghcr.io/<your-account> just images-verify prod <tag>`
   from a machine with `gh` logged in.

1. Start the stack.

   The `migrations` profile runs the migrator first and starts the API only after it exits 0. Use
   it on every start that may carry schema changes, including the first.

   ClamAV upload scanning is on by default (`MALWARE_SCAN_ENABLED=true` in `.env.example`): `up`
   starts the scanner unless that setting is `false`. ClamAV needs about 3–4 GiB of extra RAM. Its
   signature database persists in the `clamav_db` volume; the first boot with an empty volume takes
   several minutes to download it.

   ```bash
   just stack prod up YES migrations
   ```

   To run without scanning, set `MALWARE_SCAN_ENABLED=false`. Uploads are then stored unscanned;
   treat this as a temporary, accepted risk.

   To also seed the CPV or HS taxonomies, run the migrator once by itself:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just stack prod migrate YES
   ```

1. Verify.

   `/live` on the API is the shallow process check that Compose uses; `/health` also checks
   PostgreSQL and Redis. Log in as the bootstrap superuser and enrol two-factor authentication in
   the account settings: the `/admin` routes refuse a superuser without it. Then try one upload.

   ```bash
   just stack prod logs
   ```

Before you rely on the host, take the [first backup](/operations/upgrade-backup/#first-backup) and
schedule the rest.
