// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initEmailForms } from './email-form.ts';

interface Handles {
  root: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  button: HTMLButtonElement;
  message: HTMLParagraphElement;
}

function buildForm(extra: Record<string, string> = {}): Handles {
  const attrs = Object.entries({
    'data-api-url': 'https://api.test/newsletter',
    'data-success-message': 'Thanks!',
    'data-button-text': 'Subscribe',
    'data-submitting-text': 'Sending…',
    ...extra,
  })
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  document.body.innerHTML = `
    <div data-email-form ${attrs}>
      <form>
        <input name="email" type="email" required />
        <button type="submit">Subscribe</button>
      </form>
      <p class="message"></p>
    </div>
  `;

  const root = document.querySelector<HTMLElement>('[data-email-form]');
  const form = root?.querySelector<HTMLFormElement>('form');
  const input = root?.querySelector<HTMLInputElement>('input[name="email"]');
  const button = root?.querySelector<HTMLButtonElement>('button');
  const message = root?.querySelector<HTMLParagraphElement>('.message');
  if (!(root && form && input && button && message)) {
    throw new Error('buildForm: missing elements');
  }
  return { root, form, input, button, message };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Skip the browser's interactive validation so our handler runs; the handler
// itself then calls checkValidity() on the input.
function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initEmailForms validation', () => {
  it('shows a required-field error when the email is empty', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { form, message } = buildForm();
    initEmailForms();
    submit(form);
    await flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(message.textContent).toBe('Please enter your email address.');
    expect(message.className).toContain('message-error');
  });

  it('shows a type-mismatch error for an invalid email', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { form, input, message } = buildForm();
    input.value = 'not-an-email';
    initEmailForms();
    submit(form);
    await flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(message.textContent).toBe('Please enter a valid email address.');
  });
});

describe('initEmailForms submission', () => {
  it('posts the trimmed email and shows the success message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'ignored' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { form, input, message } = buildForm();
    input.value = '  user@example.com  ';
    initEmailForms();
    submit(form);
    await flush();
    await flush();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/newsletter',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify('user@example.com'),
      }),
    );
    expect(message.textContent).toBe('Thanks!');
    expect(message.className).toContain('message-success');
    expect(input.value).toBe('');
  });

});

describe('initEmailForms error paths', () => {
  it('shows the server detail when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: 'Already subscribed' }),
      }),
    );

    const { form, input, message } = buildForm();
    input.value = 'user@example.com';
    initEmailForms();
    submit(form);
    await flush();
    await flush();

    expect(message.textContent).toBe('Already subscribed');
    expect(message.className).toContain('message-error');
  });

  it('falls back to a generic error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { form, input, message, button } = buildForm();
    input.value = 'user@example.com';
    initEmailForms();
    submit(form);
    await flush();
    await flush();

    expect(message.textContent).toBe('An error occurred. Please try again later.');
    expect(button.disabled).toBe(false);
    expect(input.disabled).toBe(false);
    expect(button.textContent).toBe('Subscribe');
  });

  it('wires only one submit handler when init runs twice', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { form, input } = buildForm();
    input.value = 'user@example.com';
    initEmailForms();
    initEmailForms();
    submit(form);
    await flush();
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
