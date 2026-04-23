const HOME_PATH = '/';
const REDIRECT_DELAY_MS = 3000;

function showStatus(statusEl: HTMLElement, message: string, state: 'success' | 'error') {
  const text = document.createElement('p');
  text.textContent = message;
  statusEl.className = `status status-${state}`;
  statusEl.replaceChildren(text);
}

export function initTokenActions() {
  const actions = document.querySelectorAll<HTMLElement>('[data-token-action]');

  for (const actionRoot of actions) {
    if (actionRoot.dataset.initialized === 'true') {
      continue;
    }

    actionRoot.dataset.initialized = 'true';

    const statusEl = actionRoot.querySelector<HTMLElement>('[data-token-status]');
    if (!statusEl) {
      continue;
    }

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      showStatus(statusEl, actionRoot.dataset.noTokenMessage ?? 'No token provided.', 'error');
      return;
    }

    fetch(actionRoot.dataset.apiUrl ?? '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token),
    })
      .then(async (response) => {
        if (response.ok) {
          showStatus(statusEl, actionRoot.dataset.successMessage ?? 'Success!', 'success');
          window.setTimeout(() => {
            window.location.href = HOME_PATH;
          }, REDIRECT_DELAY_MS);
          return;
        }

        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        showStatus(
          statusEl,
          payload?.detail ?? actionRoot.dataset.defaultErrorMessage ?? 'Request failed.',
          'error',
        );
      })
      .catch(() => {
        showStatus(statusEl, 'An error occurred. Please try again later.', 'error');
      });
  }
}
