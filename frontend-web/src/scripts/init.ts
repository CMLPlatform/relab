import { initThemeControl } from './theme.ts';

let initialized = false;

export function initClient() {
  if (initialized) {
    return;
  }

  initialized = true;

  initThemeControl();
}
