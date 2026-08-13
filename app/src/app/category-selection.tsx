import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppText } from '@/components/base/AppText';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { Icon } from '@/components/base/Icon';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { PageContainer } from '@/components/base/PageContainer';
import { Searchbar } from '@/components/base/Searchbar';
import { SignedOutState } from '@/components/base/SignedOutState';
import CPVCard from '@/components/product/CPVCard';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { useCategorySelection } from '@/features/products/useCategorySelection';
import { useAppTheme } from '@/theme';
import type { CPVCategory } from '@/types/CPVCategory';

export default function CategorySelection() {
  const {
    user,
    cpvClass,
    history,
    filtered,
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    selectBranch,
    moveUp,
    selectType,
  } = useCategorySelection();

  const renderItem = useCallback(
    ({ item }: { item: CPVCategory }) => (
      <CategoryListItem item={item} onSelectType={selectType} onSelectBranch={selectBranch} />
    ),
    [selectType, selectBranch],
  );
  const keyExtractor = useCallback((item: CPVCategory) => String(item.id), []);

  // useCategorySelection's useRequireAuth('/products') fires the redirect, but
  // this screen is pushed on top of an already-mounted edit screen — a session
  // that expires while the picker is open can leave it visible for longer than
  // a single render, so a real explanation (not a loading flicker) belongs here.
  if (!user) return <SignedOutState />;
  if (!cpvClass) {
    return <CenteredSpinner />;
  }

  return (
    // phoneFullBleed: the search bar, blurb, and list own their own px-4/gap-3
    // flow spacing on the 4/8 grid, so only the desktop centering/cap is
    // wanted here.
    <PageContainer phoneFullBleed>
      <View className="gap-3 px-4 pt-4">
        <Searchbar placeholder="Search" onChangeText={setSearchQuery} value={searchQuery} />
        <View className="flex-row items-start gap-1">
          <AppText variant="caption" className="text-muted-foreground flex-1">
            Search by name or description, or browse into a category. Tap a category to select it as
            the product type.
          </AppText>
          <InfoTooltip title="Product types come from a standard procurement taxonomy (CPV). Pick the closest match — it powers filtering and the research statistics." />
        </View>
        {history.length > 1 && <CPVHistory history={history} onPress={moveUp} />}
      </View>
      <FlatList
        contentContainerClassName="gap-4 p-4"
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          // Quote debouncedSearchQuery (what `filtered` was actually computed
          // from), not the immediate searchQuery — otherwise the message can
          // name a query newer than the results it's describing while the
          // 300ms debounce is still catching up.
          debouncedSearchQuery ? (
            <View className="items-center gap-2 p-8">
              <AppText className="text-center text-muted-foreground">
                No categories match &ldquo;{debouncedSearchQuery}&rdquo;. Try a broader term.
              </AppText>
            </View>
          ) : null
        }
      />
    </PageContainer>
  );
}

function CategoryListItem({
  item,
  onSelectType,
  onSelectBranch,
}: {
  item: CPVCategory;
  onSelectType: (id: CPVCategory['id']) => void;
  onSelectBranch: (item: CPVCategory) => void;
}) {
  const handleSelect = useCallback(() => onSelectType(item.id), [onSelectType, item.id]);
  const handleBranch = useCallback(() => onSelectBranch(item), [onSelectBranch, item]);
  return (
    <View>
      <CPVCard
        CPV={item}
        onPress={handleSelect}
        actionElement={<CPVLink CPV={item} onPress={handleBranch} />}
      />
    </View>
  );
}

function CPVHistory({ history, onPress }: { history: CPVCategory[]; onPress?: () => void }) {
  const { colors, tokens } = useAppTheme();
  const historyStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.history,
      { backgroundColor: tokens.surface.accent },
      pressed && { opacity: 0.5 },
    ],
    [tokens],
  );
  return (
    <Pressable
      style={historyStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back to parent category"
    >
      <Icon size="md" name="chevron-left" color={colors.primary} />
      <Text
        numberOfLines={2}
        ellipsizeMode={'tail'}
        className="shrink"
        style={{ color: colors.primary }}
      >
        {history[history.length - 1].description}
      </Text>
    </Pressable>
  );
}

function CPVLink({ CPV, onPress }: { CPV: CPVCategory; onPress?: () => void }) {
  const { colors } = useAppTheme();
  const linkStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [styles.link, pressed && { opacity: 0.5 }],
    [],
  );

  if (CPV.directChildren.length <= 0) {
    return <View style={{ height: MIN_TAP_TARGET }} />;
  }

  return (
    <Pressable
      style={linkStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${CPV.directChildren.length} subcategories`}
    >
      <Text className="text-right" style={{ fontSize: 14, color: colors.primary }}>
        {`${CPV.directChildren.length} subcategories`}
      </Text>
      <Icon size="md" name="chevron-right" color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  history: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    minHeight: MIN_TAP_TARGET,
    borderRadius: radius.control,
  },
  link: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
});
