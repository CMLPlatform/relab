import type { ProductImageLightbox } from '@/components/product/gallery/ProductImageLightbox';

// NOTE: one import() shared by lazy() and the press/hover prefetch, so both hit the same chunk.
export const loadLightbox = (): Promise<{ default: typeof ProductImageLightbox }> =>
  import('@/components/product/gallery/ProductImageLightbox').then((m) => ({
    default: m.ProductImageLightbox,
  }));

// NOTE: prefetch only; the lazy() path surfaces real load failures, so swallow them here.
export const prefetchLightbox = () => {
  void loadLightbox().catch(() => {});
};
