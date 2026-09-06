import { AppText } from '@/components/base/AppText';
import { truncateHeaderLabel } from '@/features/products/truncateHeaderLabel';

/** Header title for the detail screen: plain truncated text. Editing happens in SpecHeader. */
export function ProductNameHeader({ name }: { name: string | undefined }) {
  return (
    <AppText variant="body" numberOfLines={1} className="font-bold" style={{ flexShrink: 1 }}>
      {truncateHeaderLabel(name, 36)}
    </AppText>
  );
}
