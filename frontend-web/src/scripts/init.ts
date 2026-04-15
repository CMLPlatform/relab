import { initEmailForms } from '@/scripts/email-form';
import { initThemeControl } from '@/scripts/theme';
import { initTokenActions } from '@/scripts/token-action';

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
