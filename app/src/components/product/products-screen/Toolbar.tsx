import { useCallback } from 'react';
import { View } from 'react-native';
import { IconButton, Menu, Searchbar } from 'react-native-paper';
import { productsScreenStyles as styles } from './shared';

type SortOption = {
  label: string;
  value: readonly string[];
};

type ProductsSearchToolbarProps = {
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

  return (
    <View style={styles.searchToolbar}>
      <Searchbar
        placeholder="Search products"
        onChangeText={handleSearchChange}
        value={searchQuery}
        icon="magnify"
        clearIcon="close"
        loading={isFetching && !!debouncedSearchQuery}
        style={styles.searchbar}
      />
      <Menu
        visible={sortMenuVisible}
        onDismiss={closeSortMenu}
        anchor={
          <IconButton
            icon="sort"
            mode="contained-tonal"
            onPress={openSortMenu}
            accessibilityLabel="Sort products"
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
