// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  getStoredTheme,
  getThemeBootstrapScript,
  initThemeControl,
  resolveTheme,
  STORAGE_KEY,
} from './theme.ts';

function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => {
      for (const cb of listeners) {
        cb();
      }
      return true;
    },
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return mql;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-preference');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getStoredTheme', () => {
  it('returns "system" when nothing is stored', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('returns the stored theme when it is a valid name', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('falls back to "system" for invalid stored values', () => {
    window.localStorage.setItem(STORAGE_KEY, 'neon');
    expect(getStoredTheme()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('returns explicit light/dark unchanged', () => {
    expect(resolveTheme('light', mockMatchMedia(true))).toBe('light');
    expect(resolveTheme('dark', mockMatchMedia(false))).toBe('dark');
  });

  it('resolves "system" from prefers-color-scheme', () => {
    expect(resolveTheme('system', mockMatchMedia(true))).toBe('dark');
    expect(resolveTheme('system', mockMatchMedia(false))).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets data attributes on the root element', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePreference).toBe('dark');
  });

  it('updates the dynamic theme-color meta tag when present', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('data-dynamic-theme', '');
    document.head.append(meta);

    applyTheme('dark');
    expect(meta.getAttribute('content')).toBe('#0a141d');

    applyTheme('light');
    expect(meta.getAttribute('content')).toBe('#eef4f7');
  });
});

describe('initThemeControl', () => {
  function buildControl() {
    document.body.innerHTML = `
      <div data-theme-control>
        <button data-theme-toggle type="button">Theme</button>
      </div>
    `;
    const control = document.querySelector<HTMLElement>('[data-theme-control]');
    const button = control?.querySelector<HTMLButtonElement>('button');
    if (!(control && button)) {
      throw new Error('buildControl: missing elements');
    }
    return { control, button };
  }

  it('cycles system → light → dark → system on click', () => {
    const { button } = buildControl();
    initThemeControl();

    expect(getStoredTheme()).toBe('system');
    button.click();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
    button.click();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    button.click();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system');
  });

  it('is idempotent when called twice', () => {
    const { control, button } = buildControl();
    initThemeControl();
    initThemeControl();
    expect(control.dataset.initialized).toBe('true');
    button.click();
    // Only one listener wired, so exactly one step forward.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
  });
});

describe('getThemeBootstrapScript', () => {
  it('returns a self-invoking script string referencing the storage key', () => {
    const script = getThemeBootstrapScript();
    expect(script).toContain(JSON.stringify(STORAGE_KEY));
    expect(script.trim().startsWith('(()')).toBe(true);
  });
});
