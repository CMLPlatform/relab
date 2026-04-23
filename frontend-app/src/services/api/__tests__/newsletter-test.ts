import { describe, expect, it } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { server } from '@/test-utils/server';
import { getNewsletterPreference, setNewsletterPreference } from '../newsletter';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

describe('Newsletter API service', () => {
  it('reads the current newsletter preference', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({
          email: 'reader@example.com',
          subscribed: true,
          is_confirmed: true,
        }),
      ),
    );

    await expect(getNewsletterPreference()).resolves.toEqual({
      email: 'reader@example.com',
      subscribed: true,
      is_confirmed: true,
    });
  });

  it('updates the newsletter preference', async () => {
    server.use(
      http.put(`${API_URL}/newsletter/me`, async ({ request }) => {
        const body = (await request.json()) as { subscribed: boolean };

        return HttpResponse.json({
          email: 'writer@example.com',
          subscribed: body.subscribed,
          is_confirmed: body.subscribed,
        });
      }),
    );

    await expect(setNewsletterPreference(true)).resolves.toEqual({
      email: 'writer@example.com',
      subscribed: true,
      is_confirmed: true,
    });
  });

  it('throws a readable error when the update fails', async () => {
    server.use(
      http.put(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Nope' }, { status: 500 }),
      ),
    );

    await expect(setNewsletterPreference(false)).rejects.toThrow('Nope');
  });

  it('throws with fallback message when the update fails without a detail field', async () => {
    server.use(http.put(`${API_URL}/newsletter/me`, () => HttpResponse.json({}, { status: 503 })));

    await expect(setNewsletterPreference(true)).rejects.toThrow(
      'Newsletter request failed with HTTP 503',
    );
  });

  it('throws when reading newsletter preference fails', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(getNewsletterPreference()).rejects.toThrow('Not found');
  });

  it('throws with fallback message when reading preference fails without detail', async () => {
    server.use(http.get(`${API_URL}/newsletter/me`, () => HttpResponse.json({}, { status: 500 })));

    await expect(getNewsletterPreference()).rejects.toThrow(
      'Newsletter request failed with HTTP 500',
    );
  });
});
