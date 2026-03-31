import { describe, expect, it } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { server } from '@/test-utils/server';
import { allProductTypes, searchProductTypes } from '../productTypes';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

describe('productTypes API service', () => {
  describe('searchProductTypes', () => {
    it('returns product types from a successful response', async () => {
      server.use(
        http.get(`${API_URL}/product-types`, () =>
          HttpResponse.json({
            items: [
              { id: 1, name: 'Electronics' },
              { id: 2, name: 'Furniture' },
            ],
            total: 2,
            page: 1,
            size: 50,
            pages: 1,
          }),
        ),
      );

      const result = await searchProductTypes();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Electronics' });
      expect(result[1]).toEqual({ id: 2, name: 'Furniture' });
    });

    it('returns an empty array when items is absent', async () => {
      server.use(http.get(`${API_URL}/product-types`, () => HttpResponse.json({})));

      const result = await searchProductTypes();

      expect(result).toEqual([]);
    });

    it('sends the search parameter when provided', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [{ id: 1, name: 'Electronics' }] });
        }),
      );

      await searchProductTypes('electr');

      expect(capturedUrl?.searchParams.get('search')).toBe('electr');
    });

    it('does not send a search param when search is undefined', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await searchProductTypes();

      expect(capturedUrl?.searchParams.has('search')).toBe(false);
    });

    it('sends page and size query params', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await searchProductTypes(undefined, 2, 25);

      expect(capturedUrl?.searchParams.get('page')).toBe('2');
      expect(capturedUrl?.searchParams.get('size')).toBe('25');
    });

    it('throws on HTTP error', async () => {
      server.use(
        http.get(`${API_URL}/product-types`, () => HttpResponse.json({}, { status: 500 })),
      );

      await expect(searchProductTypes()).rejects.toThrow('HTTP error');
    });
  });

  describe('allProductTypes', () => {
    it('requests page=1 and size=100', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await allProductTypes();

      expect(capturedUrl?.searchParams.get('page')).toBe('1');
      expect(capturedUrl?.searchParams.get('size')).toBe('100');
    });

    it('returns all product types in one page', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Type ${i + 1}` }));
      server.use(
        http.get(`${API_URL}/product-types`, () => HttpResponse.json({ items, total: 5 })),
      );

      const result = await allProductTypes();

      expect(result).toHaveLength(5);
      expect(result[4].name).toBe('Type 5');
    });
  });
});
