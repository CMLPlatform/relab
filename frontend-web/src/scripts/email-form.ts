function setMessage(
  messageEl: HTMLParagraphElement,
  text: string,
  state: 'success' | 'error' | 'idle',
) {
  messageEl.textContent = text;
  messageEl.className = `message${state === 'idle' ? '' : ` message-${state}`}`;
}

function getValidationMessage(input: HTMLInputElement) {
  if (input.validity.valueMissing) {
    return 'Please enter your email address.';
  }

  if (input.validity.typeMismatch) {
    return 'Please enter a valid email address.';
  }

  return input.validationMessage;
}

function getFormElements(formRoot: HTMLElement) {
  const form = formRoot.querySelector<HTMLFormElement>('form');
  const input = form?.elements.namedItem('email');
  const button = form?.querySelector<HTMLButtonElement>('button');
  const messageEl = formRoot.querySelector<HTMLParagraphElement>('.message');

  if (!(form && input instanceof HTMLInputElement && button && messageEl)) {
    return null;
  }

  return { button, form, input, messageEl };
}

async function submitEmailForm(
  formRoot: HTMLElement,
  elements: {
    form: HTMLFormElement;
    input: HTMLInputElement;
    button: HTMLButtonElement;
    messageEl: HTMLParagraphElement;
  },
) {
  const { button, form, input, messageEl } = elements;
  const defaultButtonText = formRoot.dataset.buttonText ?? button.textContent ?? 'Submit';
  const submittingText = formRoot.dataset.submittingText ?? 'Sending…';

  button.disabled = true;
  input.disabled = true;
  button.textContent = submittingText;
  setMessage(messageEl, 'Submitting…', 'idle');

  try {
    const response = await fetch(formRoot.dataset.apiUrl ?? '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.value.trim()),
    });

    const payload = (await response.json().catch(() => null)) as {
      detail?: string;
      message?: string;
    } | null;

    if (response.ok) {
      setMessage(
        messageEl,
        formRoot.dataset.successMessage ?? payload?.message ?? 'Success!',
        'success',
      );
      form.reset();
      return;
    }

    setMessage(messageEl, payload?.detail ?? 'An error occurred. Please try again.', 'error');
  } catch {
    setMessage(messageEl, 'An error occurred. Please try again later.', 'error');
  } finally {
    button.disabled = false;
    input.disabled = false;
    button.textContent = defaultButtonText;
  }
}

function initEmailForm(formRoot: HTMLElement) {
  if (formRoot.dataset.initialized === 'true') {
    return;
  }

  const elements = getFormElements(formRoot);
  if (!elements) {
    return;
  }

  formRoot.dataset.initialized = 'true';

  const { button, form, input, messageEl } = elements;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!input.checkValidity()) {
      input.focus();
      setMessage(messageEl, getValidationMessage(input), 'error');
      return;
    }

    await submitEmailForm(formRoot, { button, form, input, messageEl });
  });
}

export function initEmailForms() {
  const forms = document.querySelectorAll<HTMLElement>('[data-email-form]');

  for (const formRoot of forms) {
    initEmailForm(formRoot);
  }
}
