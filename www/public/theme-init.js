// Resolve theme before first paint to avoid a flash for users whose stored
// preference differs from their OS scheme. Loaded as a classic (render-blocking)
// script from Layout.astro <head>; kept external so the CSP can stay
// script-src 'self' without inline-script hashes. Mirrors STORAGE_KEY/logic in
// src/scripts/theme.ts.
(() => {
  // TODO(drop-by 2027-01-31): drop the relab-theme fallback
  const stored = localStorage.getItem('r9lab-theme') ?? localStorage.getItem('relab-theme');
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
