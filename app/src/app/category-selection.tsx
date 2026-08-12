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
import { PageContainer } from '@/components/base/PageContainer';
import { Searchbar } from '@/components/base/Searchbar';
import { SignedOutState } from '@/components/base/SignedOutState';
import CPVCard from '@/components/product/CPVCard';
import { radius } from '@/constants';
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
    // phoneFullBleed: the search bar, blurb, and list already own their 15px
    // phone insets, so only the desktop centering/cap is wanted here.
    <PageContainer phoneFullBleed>
      <Searchbar
        style={{ position: 'absolute', top: 15, left: 15, right: 15, zIndex: 1 }}
        placeholder="Search"
        onChangeText={setSearchQuery}
        value={searchQuery}
      />
      <Text className="mt-[70px] mx-[15px] text-muted-foreground" style={{ fontSize: 12 }}>
        Search by name or description, or browse with the &apos;Subcategories&apos; button on each
        card. Tap or click a card to select it.
      </Text>
      {history.length > 1 && <CPVHistory history={history} onPress={moveUp} />}
      <FlatList
        contentContainerClassName="gap-[15px] p-[15px] mb-5"
        contentContainerStyle={{ paddingTop: history.length > 1 ? 152 : 85 }}
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          searchQuery ? (
            <View className="items-center gap-2 p-8">
              <AppText className="text-center text-muted-foreground">
                No categories match &ldquo;{searchQuery}&rdquo;. Try a broader term.
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
  const { colors } = useAppTheme();
  const historyStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.history,
      // Interactive surface — primary family, never the manila accent
      // (MD3 `tertiary` maps to the brand accent; DESIGN.md keeps manila to text).
      { backgroundColor: colors.primaryContainer },
      pressed && { opacity: 0.5 },
    ],
    [colors],
  );
  return (
    <Pressable
      style={historyStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back to parent category"
    >
      <Icon size="md" name="chevron-left" color={colors.onTertiaryContainer} />
      <Text
        numberOfLines={2}
        ellipsizeMode={'tail'}
        className="shrink"
        style={{ color: colors.onTertiaryContainer }}
      >
        {history[history.length - 1].description}
      </Text>
    </Pressable>
  );
}

function CPVLink({ CPV, onPress }: { CPV: CPVCategory; onPress?: () => void }) {
  const { colors } = useAppTheme();
  const linkStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.link,
      { backgroundColor: colors.secondaryContainer },
      pressed && { opacity: 0.5 },
    ],
    [colors],
  );

  if (CPV.directChildren.length <= 0) {
    return <View style={{ height: 50 }} />;
  }

  return (
    <Pressable
      style={linkStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${CPV.directChildren.length} subcategories`}
    >
      <Text className="text-right" style={{ fontSize: 14, color: colors.onSecondaryContainer }}>
        {`${CPV.directChildren.length} subcategories`}
      </Text>
      <Icon size="md" name="chevron-right" color={colors.onSecondaryContainer} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  history: {
    position: 'absolute',
    top: 80,
    left: 15,
    right: 15,
    zIndex: 1,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.control,
  },
  link: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingHorizontal: 12,
  },
});
