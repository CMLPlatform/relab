import { describe, expect, it } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { API_URL } from '@/config';
import {
  fetchProductTypesByName,
  productTypeLabel,
  productTypeLabelMap,
  searchProductTypes,
} from '@/services/api/productTypes';
import { server } from '@/test-utils/server';

describe('productTypes API service', () => {
  describe('productTypeLabel', () => {
    it('shows a CPV type by its label, never by its code', () => {
      // Prod type 1967, as the API returns it.
      expect(productTypeLabel({ name: 'CPV: 302132', description: 'Tablet computer' })).toBe(
        'Tablet computer',
      );
    });

    it('shows nothing for a CPV code with no label', () => {
      expect(productTypeLabel({ name: 'CPV: 302132', description: null })).toBeUndefined();
      expect(productTypeLabel({ name: 'CPV: 302132', description: '   ' })).toBeUndefined();
    });

    it('keeps a hand-authored name even when the type has a description', () => {
      expect(productTypeLabel({ name: 'Laptop', description: 'A portable computer' })).toBe(
        'Laptop',
      );
    });

    it('tolerates a missing or empty product type', () => {
      expect(productTypeLabel(null)).toBeUndefined();
      expect(productTypeLabel(undefined)).toBeUndefined();
      expect(productTypeLabel({ name: '  ' })).toBeUndefined();
    });
  });

  describe('productTypeLabelMap', () => {
    it('maps stored names to labels, skipping types that resolve to none', () => {
      expect(
        productTypeLabelMap([
          { id: 1, name: 'CPV: 302132', description: 'Tablet computer' },
          { id: 2, name: 'Laptop', description: null },
          { id: 3, name: 'CPV: 999999', description: null },
        ]),
      ).toEqual({ 'CPV: 302132': 'Tablet computer', Laptop: 'Laptop' });
    });
  });

  describe('fetchProductTypesByName', () => {
    it('resolves the selected names so a link-restored filter can show labels', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({
            items: [{ id: 1, name: 'CPV: 302132', description: 'Tablet computer' }],
          });
        }),
      );

      const result = await fetchProductTypesByName(['CPV: 302132']);

      expect(capturedUrl?.searchParams.getAll('name[in]')).toEqual(['CPV: 302132']);
      expect(productTypeLabelMap(result)).toEqual({ 'CPV: 302132': 'Tablet computer' });
    });

    it('sends one name[in] per requested name', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await fetchProductTypesByName(['CPV: 302132', 'Laptop']);

      expect(capturedUrl?.searchParams.getAll('name[in]')).toEqual(['CPV: 302132', 'Laptop']);
    });

    it('caps the lookup at the 50 names the API accepts instead of failing the whole request', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await fetchProductTypesByName(Array.from({ length: 51 }, (_, i) => `CPV: ${i}`));

      expect(capturedUrl?.searchParams.getAll('name[in]')).toHaveLength(50);
      expect(capturedUrl?.searchParams.get('size')).toBe('50');
    });

    it('makes no request for an empty selection', async () => {
      let called = false;
      server.use(
        http.get(`${API_URL}/product-types`, () => {
          called = true;
          return HttpResponse.json({ items: [] });
        }),
      );

      expect(await fetchProductTypesByName([])).toEqual([]);
      expect(called).toBe(false);
    });
  });

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

      await expect(searchProductTypes()).rejects.toThrow('Failed to fetch');
    });
  });
});
