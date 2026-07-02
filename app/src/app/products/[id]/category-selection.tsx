import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActivityIndicator, HelperText, Icon, Searchbar } from 'react-native-paper';

import CPVCard from '@/components/product/CPVCard';
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

  if (!user) return null;
  if (!cpvClass) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Searchbar
        style={{ position: 'absolute', top: 15, left: 15, right: 15, zIndex: 1 }}
        placeholder="Search"
        onChangeText={setSearchQuery}
        value={searchQuery}
      />
      <HelperText type="info" style={{ marginTop: 70, marginHorizontal: 15 }}>
        Search by name or description, or browse with the &apos;Subcategories&apos; button on each
        card. Tap or click a card to select it.
      </HelperText>
      {history.length > 1 && <CPVHistory history={history} onPress={moveUp} />}
      <FlatList
        contentContainerStyle={{
          gap: 15,
          padding: 15,
          paddingTop: history.length > 1 ? 152 : 85,
          marginBottom: 20,
        }}
        data={filtered}
        renderItem={renderItem}
      />
    </View>
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
      styles.historyContainer,
      { backgroundColor: colors.tertiaryContainer },
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
      <Icon size={20} source={'chevron-left'} color={colors.onTertiaryContainer} />
      <Text
        numberOfLines={2}
        ellipsizeMode={'tail'}
        style={[styles.historyText, { color: colors.onTertiaryContainer }]}
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
      styles.linkContainer,
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
      <Text style={[styles.linkText, { color: colors.onSecondaryContainer }]}>
        {`${CPV.directChildren.length} subcategories`}
      </Text>
      <Icon size={20} source={'chevron-right'} color={colors.onSecondaryContainer} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
  },
  linkText: {
    fontSize: 14,
    textAlign: 'right',
  },
  historyContainer: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    height: 60,
    alignItems: 'center',
    top: 80,
    left: 15,
    right: 15,
    zIndex: 1,
    borderRadius: 5,
  },
  historyText: {
    flexShrink: 1,
  },
});
