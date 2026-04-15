function showStatus(
  statusEl: HTMLElement,
  message: string,
  state: 'success' | 'error',
) {
  const text = document.createElement('p');
  text.textContent = message;
  statusEl.className = `status status-${state}`;
  statusEl.replaceChildren(text);
}

export function initTokenActions() {
  const actions = document.querySelectorAll<HTMLElement>('[data-token-action]');

  actions.forEach((actionRoot) => {
    if (actionRoot.dataset.initialized === 'true') {
      return;
    }

    actionRoot.dataset.initialized = 'true';

    const statusEl = actionRoot.querySelector<HTMLElement>('[data-token-status]');
    if (!statusEl) {
      return;
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
            window.location.href = '/';
          }, 3000);
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
  });
}
