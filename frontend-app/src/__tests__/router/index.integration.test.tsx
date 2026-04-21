import { describe, expect, it } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';
import IndexRoute from '@/app/index';

describe('index route', () => {
  it('redirects guests to /products', () => {
    renderRouter({
      index: IndexRoute,
      'products/index': () => null,
    });

    expect(screen).toHavePathname('/products');
  });
});
