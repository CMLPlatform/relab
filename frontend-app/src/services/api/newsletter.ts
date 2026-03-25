import { fetchWithTimeout } from './request';
import { getToken } from './authentication';

const apiURL = `${process.env.EXPO_PUBLIC_API_URL}`;

export type NewsletterPreference = {
  email: string;
  subscribed: boolean;
  is_confirmed: boolean;
};

async function newsletterRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...(options.headers as Record<string, string> | undefined) };
  const token = await getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetchWithTimeout(new URL(apiURL + path), {
    ...options,
    headers,
    credentials: 'include',
  });
}

async function parseError(response: Response): Promise<never> {
  const errorData = await response.json().catch(() => null);
  const message = errorData?.detail || `Newsletter request failed with HTTP ${response.status}.`;
  throw new Error(message);
}

export async function getNewsletterPreference(): Promise<NewsletterPreference> {
  const response = await newsletterRequest('/newsletter/me', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
}

export async function setNewsletterPreference(subscribed: boolean): Promise<NewsletterPreference> {
  const response = await newsletterRequest('/newsletter/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ subscribed }),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
}
