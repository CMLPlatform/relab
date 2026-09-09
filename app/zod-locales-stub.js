// NOTE: stub for zod/v4/locales/index.js, applied on web only. zod 4.5.4's v4
// entrypoints (node_modules/zod/v4/core/index.js, v4/mini/external.js and
// v4/classic/external.js) each do `export * as locales from "../locales/index.js"`,
// and Metro does not tree-shake namespace re-exports, so every bundled locale
// shipped in the __common chunk. The app only uses the built-in English messages
// (nothing calls `z.config(z.locales.*)`). Mapped in metro.config.js — delete
// both if a locale is ever actually used.
module.exports = {};
