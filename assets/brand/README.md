# Shared Brand Assets

This directory is the canonical source of truth for shared RELab brand identity
primitives used across the monorepo.

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

The current logo is the Noto Color Emoji hammer-and-wrench stand-in
(`svg/emoji_u1f6e0.svg`). Noto Emoji graphics are from Google's Noto Emoji
project, licensed under Apache 2.0.

The sync script uses ImageMagick `convert` to generate PNG and `.ico` favicon
derivatives from `logo.svg`.

Current shared assets:

- `brand.css`
- `images/bg-light.jpg`
- `images/bg-dark.jpg`
- `logo.svg`
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
- SVG logos and favicons: copied from `logo.svg` to docs and www public image folders.
- PNG outputs: generated for Expo app metadata, the www social preview logo, and docs/www Apple touch icons.
- `.ico` fallback favicons: generated at the docs/www public root for legacy browser support and in backend static storage for `/favicon.ico` support.
