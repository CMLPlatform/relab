import { View } from 'react-native';
import { IconButton, Menu, Searchbar } from 'react-native-paper';
import { productsScreenStyles as styles } from './shared';
import type { ProductsSearchToolbarProps } from './types';

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
          .filter((option) => searchQueryURL || option.value[0] !== 'rank')
          .map((option) => (
            <Menu.Item
              key={option.label}
              title={option.label}
              trailingIcon={sortBy[0] === option.value[0] ? 'check' : undefined}
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
