import { productGridColumns } from '@/features/products/productGridColumns';

test('phone width uses a single full-bleed column', () => {
  expect(productGridColumns(390)).toBe(1);
});

test('tablet width uses two columns', () => {
  expect(productGridColumns(800)).toBe(2);
});

// Boundary shift: raw 1024px used to pick 3 columns, but the post-gutter
// content is only ~960px — which comfortably fits 2, not 3.
test('a 1024px window tiers on the ~960px content width → 2 columns', () => {
  expect(productGridColumns(1024)).toBe(2);
});

test('a wide window reaches 3 columns once post-gutter content clears 1000px', () => {
  expect(productGridColumns(1280)).toBe(3);
});
