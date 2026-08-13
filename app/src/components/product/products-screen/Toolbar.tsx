import type { RefObject } from 'react';
import { useCallback } from 'react';
import { Platform, type TextInput, View } from 'react-native';
import { IconButton } from '@/components/base/IconButton';
import { Menu } from '@/components/base/Menu';
import { Searchbar } from '@/components/base/Searchbar';

// Web-only hint for the "/" focus shortcut (see useProductSearchShortcut);
// native has no such shortcut, so its placeholder stays plain.
const SEARCH_PLACEHOLDER = Platform.select({
  web: 'Search products ("/" to focus)',
  default: 'Search products',
});

type SortOption = {
  label: string;
  value: readonly string[];
};

type ProductsSearchToolbarProps = {
  searchRef?: RefObject<TextInput | null>;
  searchQuery: string;
  debouncedSearchQuery: string;
  isFetching: boolean;
  searchQueryURL: string;
  sortBy: string[];
  sortOptions: readonly SortOption[];
  sortMenuVisible: boolean;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSetSortMenuVisible: (visible: boolean) => void;
  onSortChange: (sort: readonly string[]) => void;
};

export function ProductsSearchToolbar({
  searchRef,
  searchQuery,
  debouncedSearchQuery,
  isFetching,
  searchQueryURL,
  sortBy,
  sortOptions,
  sortMenuVisible,
  onSearchChange,
  onClearSearch,
  onSetSortMenuVisible,
  onSortChange,
}: ProductsSearchToolbarProps) {
  const handleSearchChange = useCallback(
    (text: string) => {
      onSearchChange(text);
      if (!text) {
        onClearSearch();
      }
    },
    [onSearchChange, onClearSearch],
  );
  const closeSortMenu = useCallback(() => onSetSortMenuVisible(false), [onSetSortMenuVisible]);
  const openSortMenu = useCallback(() => onSetSortMenuVisible(true), [onSetSortMenuVisible]);
  const currentSort = sortOptions.find((option) => sortBy.join(',') === option.value.join(','));
  const sortAccessibilityLabel = currentSort ? `Sort: ${currentSort.label}` : 'Sort products';

  return (
    <View className="flex-row items-center gap-1">
      <Searchbar
        ref={searchRef}
        placeholder={SEARCH_PLACEHOLDER}
        onChangeText={handleSearchChange}
        value={searchQuery}
        loading={isFetching && !!debouncedSearchQuery}
        style={{ flex: 1 }}
      />
      <Menu
        visible={sortMenuVisible}
        onDismiss={closeSortMenu}
        anchor={
          <IconButton
            icon="arrow-down-up"
            mode="contained-tonal"
            onPress={openSortMenu}
            accessibilityLabel={sortAccessibilityLabel}
          />
        }
      >
        {sortOptions
          .filter((option) => searchQueryURL || option.value.length > 0)
          .map((option) => (
            <SortMenuItem
              key={option.label}
              option={option}
              active={sortBy.join(',') === option.value.join(',')}
              onSortChange={onSortChange}
              onCloseMenu={closeSortMenu}
            />
          ))}
      </Menu>
    </View>
  );
}

function SortMenuItem({
  option,
  active,
  onSortChange,
  onCloseMenu,
}: {
  option: SortOption;
  active: boolean;
  onSortChange: (sort: readonly string[]) => void;
  onCloseMenu: () => void;
}) {
  const handlePress = useCallback(() => {
    onSortChange(option.value);
    onCloseMenu();
  }, [onSortChange, onCloseMenu, option.value]);

  return (
    <Menu.Item
      title={option.label}
      trailingIcon={active ? 'check' : undefined}
      onPress={handlePress}
    />
  );
}
