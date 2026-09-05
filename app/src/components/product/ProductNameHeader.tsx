import { AppText } from '@/components/base/AppText';
import { truncateHeaderLabel } from '@/features/products/truncateHeaderLabel';

/**
 * Header title for the product detail screen: the name as plain text,
 * truncated to fit. Editing the name happens in the body's SpecHeader, at
 * display scale — the header never carries a second name control.
 */
export function ProductNameHeader({ name }: { name: string | undefined }) {
  return (
    <AppText variant="body" numberOfLines={1} className="font-bold" style={{ flexShrink: 1 }}>
      {truncateHeaderLabel(name, 36)}
    </AppText>
  );
}
