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
  return (
    <View style={styles.searchToolbar}>
      <Searchbar
        placeholder="Search products"
        onChangeText={(text) => {
          onSearchChange(text);
          if (!text) onClearSearch();
        }}
        value={searchQuery}
        icon="magnify"
        clearIcon="close"
        loading={isFetching && !!debouncedSearchQuery}
        style={styles.searchbar}
      />
      <Menu
        visible={sortMenuVisible}
        onDismiss={() => onSetSortMenuVisible(false)}
        anchor={
          <IconButton
            icon="sort"
            mode="contained-tonal"
            onPress={() => onSetSortMenuVisible(true)}
            accessibilityLabel="Sort products"
          />
        }
      >
        {sortOptions
          .filter((option) => searchQueryURL || option.value.length > 0)
          .map((option) => (
            <Menu.Item
              key={option.label}
              title={option.label}
              trailingIcon={sortBy.join(',') === option.value.join(',') ? 'check' : undefined}
              onPress={() => {
                onSortChange(option.value);
                onSetSortMenuVisible(false);
              }}
            />
          ))}
      </Menu>
    </View>
  );
}
