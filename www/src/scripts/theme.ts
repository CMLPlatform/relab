// biome-ignore-all lint/style/useGlobalThis: window is the correct reference for browser DOM APIs (localStorage/matchMedia); happy-dom exposes these on window, not globalThis.
const STORAGE_KEY = 'relab-theme';
// Mirrors --relab-brand-theme-color in src/styles/brand.css (a meta tag cannot
// read the CSS light-dark() token); theme.test.ts pins the two against drift.
const THEME_META_COLORS = { light: '#edf1f7', dark: '#0a0f1a' } as const;
const THEMES = ['system', 'light', 'dark'] as const;
type ThemeName = (typeof THEMES)[number];
type ResolvedTheme = 'light' | 'dark';

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getStoredTheme(storage: Storage = window.localStorage): ThemeName {
  const storedTheme = storage.getItem(STORAGE_KEY);
  if (isThemeName(storedTheme)) {
    return storedTheme;
  }
  return 'system';
}

function resolveTheme(
  theme: ThemeName,
  mediaQuery: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)'),
): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  if (mediaQuery.matches) {
    return 'dark';
  }
  return 'light';
}

function updateThemeMeta(theme: ResolvedTheme) {
  const themeMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-dynamic-theme]',
  );

  if (!themeMeta) {
    return;
  }

  themeMeta.setAttribute('content', THEME_META_COLORS[theme]);
}

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);

  root.dataset.themePreference = theme;
  root.dataset.theme = resolvedTheme;
  updateThemeMeta(resolvedTheme);
}

function updateThemeToggle(control: HTMLElement, theme: ThemeName) {
  const button = control.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) {
    return;
  }

  control.dataset.themeCurrent = theme;
  button.setAttribute('aria-label', `Theme: ${theme}. Switch theme`);
  button.setAttribute('title', `Theme: ${theme}`);
}

function initThemeControl() {
  const control = document.querySelector<HTMLElement>('[data-theme-control]');
  if (!control || control.dataset.initialized === 'true') {
    return;
  }

  control.dataset.initialized = 'true';

  const button = control.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) {
    return;
  }

  const syncTheme = () => {
    const theme = getStoredTheme();
    applyTheme(theme);
    updateThemeToggle(control, theme);
  };

  const cycleTheme = () => {
    const currentTheme = getStoredTheme();
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];

    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    updateThemeToggle(control, nextTheme);
  };

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    if (getStoredTheme() === 'system') {
      syncTheme();
    }
  };

  syncTheme();
  button.addEventListener('click', cycleTheme);
  mediaQuery.addEventListener('change', handleMediaChange);
}

export type { ResolvedTheme, ThemeName };
export {
  applyTheme,
  getStoredTheme,
  initThemeControl,
  resolveTheme,
  STORAGE_KEY,
  THEME_META_COLORS,
  THEMES,
};
