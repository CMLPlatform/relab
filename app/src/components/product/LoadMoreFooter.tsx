import { ActivityIndicator, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { IosAnnouncement } from '@/components/base/IosAnnouncement';

/** The footer under a paged product grid: "Load more" and the running "N of M products". */
export function LoadMoreFooter({
  count,
  total,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  count: number;
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  if (count === 0) return null;

  return (
    // Live region: "Load more" keeps focus, so appended cards are otherwise silent.
    <View className="items-center gap-2 py-4" accessibilityLiveRegion="polite">
      <IosAnnouncement text={`${count} of ${total} products`} skipInitial />
      {isFetchingNextPage ? (
        <ActivityIndicator size="small" accessibilityLabel="Loading more products" />
      ) : hasNextPage ? (
        <AppButton variant="outline" onPress={onLoadMore} accessibilityLabel="Load more products">
          Load more
        </AppButton>
      ) : null}
      <AppText className="text-muted-foreground">
        <AppText variant="data">{count}</AppText> of <AppText variant="data">{total}</AppText>{' '}
        products
      </AppText>
    </View>
  );
}
