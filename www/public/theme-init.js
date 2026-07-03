// Resolve theme before first paint to avoid a flash for users whose stored
// preference differs from their OS scheme. Loaded as a classic (render-blocking)
// script from Layout.astro <head>; kept external so the Caddy CSP can stay
// script-src 'self' without inline-script hashes. Mirrors STORAGE_KEY/logic in
// src/scripts/theme.ts.
(() => {
  const stored = localStorage.getItem('relab-theme');
  const pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const resolved =
    pref === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : pref;
  document.documentElement.dataset.themePreference = pref;
  document.documentElement.dataset.theme = resolved;
})();
