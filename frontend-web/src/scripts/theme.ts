const STORAGE_KEY = 'relab-theme';
const THEMES = ['system', 'light', 'dark'] as const;
type ThemeName = (typeof THEMES)[number];
type ResolvedTheme = 'light' | 'dark';

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getStoredTheme(storage: Storage = window.localStorage): ThemeName {
  const storedTheme = storage.getItem(STORAGE_KEY);
  return isThemeName(storedTheme) ? storedTheme : 'system';
}

function resolveTheme(
  theme: ThemeName,
  mediaQuery: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)'),
): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  return mediaQuery.matches ? 'dark' : 'light';
}

function updateThemeMeta(theme: ResolvedTheme) {
  const themeMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-dynamic-theme]',
  );

  if (!themeMeta) {
    return;
  }

  themeMeta.setAttribute('content', theme === 'dark' ? '#0a141d' : '#eef4f7');
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

function getThemeBootstrapScript() {
  return `(() => {
    const storageKey = ${JSON.stringify(STORAGE_KEY)};
    const storedTheme = window.localStorage.getItem(storageKey);
    const theme = storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
      ? storedTheme
      : 'system';
    const resolvedTheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    const root = document.documentElement;
    root.dataset.themePreference = theme;
    root.dataset.theme = resolvedTheme;
  })();`;
}

export type { ResolvedTheme, ThemeName };
export {
  applyTheme,
  getStoredTheme,
  getThemeBootstrapScript,
  initThemeControl,
  resolveTheme,
  STORAGE_KEY,
  THEMES,
};
