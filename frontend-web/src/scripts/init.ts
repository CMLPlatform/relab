import { initEmailForms } from './email-form.ts';
import { initThemeControl } from './theme.ts';
import { initTokenActions } from './token-action.ts';

let initialized = false;

export function initClient() {
  if (initialized) {
    return;
  }

  initialized = true;

  initThemeControl();
  initEmailForms();
  initTokenActions();
}
