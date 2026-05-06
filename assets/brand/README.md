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
- `fonts/literata-*.woff2`
- `fonts/native/IBMPlexSans-*.ttf`

Typography ownership:

- IBM Plex Sans is the shared UI/body/app/email typeface.
- Literata is the docs/www editorial heading typeface.
- WOFF2 files are for docs/www web delivery.
- TTF files are for Expo app delivery.

Brand primitive ownership:

- `brand.css` owns web font declarations and light/dark brand color anchors.
- Synced CSS exposes brand variables as `--relab-brand-*` for docs and www.
- Consumer subrepos keep layout, spacing, component styles, shadows, radii, and
  app-specific theme behavior local.

Generated consumer output groups:

- Background images: copied to the app, docs, and www image asset folders.
- Web fonts: copied to the docs and www `public/fonts` folders.
- App fonts: copied to the Expo app `src/assets/fonts` folder.
- Brand CSS: copied to docs and www style folders.
- SVG logos and favicons: copied from `logo.svg` to docs and www public image folders.
- PNG app, logo, favicon, and touch icons: generated for Expo app metadata and docs/www browser surfaces.
- `.ico` fallback favicons: generated for legacy browser and backend `/favicon.ico` support.
