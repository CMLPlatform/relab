import { lazy, Suspense } from 'react';

// NOTE: lazy because three routes share it, which would put it on every route's first load.
const CaptureScreen = lazy(() =>
  import('@/components/product/capture/CaptureScreen').then((m) => ({ default: m.CaptureScreen })),
);

export default function ProductNewPage() {
  return (
    <Suspense fallback={null}>
      <CaptureScreen entityRole="product" />
    </Suspense>
  );
}
