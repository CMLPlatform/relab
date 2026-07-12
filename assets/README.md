# Shared Brand Assets

This directory is the source of truth for the shared ReLab brand assets
used across the monorepo.

Edit the files here, then run:

```bash
just assets-sync
```

That regenerates the consumer copies in `app/`, `docs/`, `www/`, and
`backend/`. Do not hand-edit copied consumer files unless the sync mapping
itself changes. Use:

```bash
just assets-check
```

to verify that committed consumer files still match the canonical sources.

The logo is the R9lab mark, generated from the sources in
[logo-src/](logo-src/README.md). `logo.svg` is the wide flask logo; square
favicons and app icons render from `r9lab-mark.svg`.

The sync script uses ImageMagick (`magick`, or `convert` on IMv6) to generate
the PNG and `.ico` derivatives from the SVG sources.

Current shared assets:

- `brand.css`
- `images/bg-light.jpg`
- `images/bg-dark.jpg`
- `logo.svg`
- `r9lab-*.svg` / `r9lab-*.png` — mark, logo, wordmark, and og-image variants,
  light and dark (see [logo-src/](logo-src/README.md))
- `fonts/ibm-plex-sans-*.woff2`

Typography ownership:

- `--relab-brand-font` is the single shared web/email font token.
- IBM Plex Sans is the only custom web/email typeface.
- WOFF2 files are for docs/www web delivery; italic is browser-synthesized when needed.
- The Expo app intentionally uses platform system fonts.

Brand primitive ownership:

- `brand.css` owns web font declarations and light/dark brand color anchors.
- Synced CSS exposes brand variables as `--relab-brand-*` for docs and www.
- Consumer subrepos keep layout, spacing, component styles, shadows, radii, and
  app-specific theme behavior local.

Generated consumer output groups:

- Background images: copied to the app, docs, and www image asset folders.
- Regular IBM Plex Sans web fonts: copied to the docs and www `public/fonts` folders.
- Brand CSS: copied to docs and www style folders.
- SVG logos, wordmarks, and favicons: copied from the `r9lab-*` SVGs to docs and www public image folders; favicons use the square mark.
- PNG outputs: generated for Expo app metadata, the www social preview logo, and docs/www Apple touch icons.
- `.ico` fallback favicons: generated at the docs/www public root for legacy browser support and in backend static storage for `/favicon.ico` support.
