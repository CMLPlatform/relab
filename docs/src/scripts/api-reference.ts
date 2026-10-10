import { createApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';

/** The reader's Starlight theme choice ('light' | 'dark'), or null for "follow the system". */
const storedStarlightTheme = (): 'light' | 'dark' | null => {
  try {
    const theme = localStorage.getItem('starlight-theme');
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
};

/*
 * Scalar's colour and font variables mapped onto the brand tokens. Scalar puts
 * `.light-mode` / `.dark-mode` on the body and its own toggle flips them, so
 * each class pins `color-scheme` and the `light-dark()` brand tokens resolve to
 * the matching half. Secondary text is mixed from the ink so it stays above
 * 4.5:1 on both background steps (Scalar's stock greys sit near 3.3:1). In
 * light mode the HTTP-method colours are the chart-palette strokes from
 * DESIGN.md, which clear 4.5:1 on the surface; dark mode keeps Scalar's except
 * red, lightened toward the ink for the same reason.
 */
const BRAND_CSS = `
.light-mode, .dark-mode {
  --scalar-font: var(--relab-brand-font), system-ui, sans-serif;
  --scalar-font-code: var(--relab-brand-font-mono), ui-monospace, monospace;
  --scalar-background-1: var(--relab-brand-background);
  --scalar-background-2: var(--relab-brand-surface);
  --scalar-background-3: var(--relab-brand-divider);
  --scalar-border-color: var(--relab-brand-divider);
  --scalar-color-1: var(--relab-brand-text);
  --scalar-color-2: color-mix(in srgb, var(--relab-brand-text) 82%, var(--relab-brand-background));
  --scalar-color-3: color-mix(in srgb, var(--relab-brand-text) 68%, var(--relab-brand-background));
  --scalar-color-accent: var(--relab-brand-primary);
}
/* Sidebar group toggles and the auth-type picker render under 24px; these
   bring them to the WCAG 2.5.8 minimum. */
[data-sidebar-id] button[aria-expanded].absolute { padding: 4px; }
button[id^="headlessui-popover-button"] { min-height: 24px; }
.light-mode {
  color-scheme: light;
  --scalar-color-green: #0e6b5e;
  --scalar-color-blue: #1f4c96;
  --scalar-color-orange: #a8542f;
  --scalar-color-yellow: #8f6212;
  --scalar-color-red: #b0316e;
  --scalar-color-purple: #6d4fa3;
}
.dark-mode {
  color-scheme: dark;
  --scalar-color-red: color-mix(in srgb, #b0316e 50%, var(--relab-brand-text));
}
`;

const container = document.getElementById('api-reference');

if (container instanceof HTMLElement) {
  const schemaUrl = container.dataset.schemaUrl;
  const backendApiUrl = container.dataset.backendApiUrl;
  const theme = storedStarlightTheme();
  // brand.css keys color-scheme off data-theme, so the switcher bar follows too.
  if (theme) {
    document.documentElement.dataset.theme = theme;
  }

  if (schemaUrl && backendApiUrl) {
    createApiReference(container, {
      agent: {
        disabled: true,
        hideAddApi: true,
      },
      baseServerURL: backendApiUrl,
      customCss: BRAND_CSS,
      darkMode: theme
        ? theme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches,
      documentDownloadType: 'direct',
      hideClientButton: true,
      persistAuth: false,
      showDeveloperTools: 'never',
      servers: [{ url: backendApiUrl }],
      telemetry: false,
      url: schemaUrl,
      // Scalar's fonts come from fonts.scalar.com, which the CSP font-src blocks.
      withDefaultFonts: false,
    });
  }
}
