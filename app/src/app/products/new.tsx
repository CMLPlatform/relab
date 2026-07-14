import { CaptureScreen } from '@/components/product/capture/CaptureScreen';

export default function ProductNewPage() {
  // biome-ignore lint/a11y/useValidAriaRole: CaptureScreen's own product/component prop, not an ARIA role.
  return <CaptureScreen role="product" />;
}
