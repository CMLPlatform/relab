import type { RefObject } from 'react';
import { useCallback } from 'react';
import { Platform, type TextInput, View } from 'react-native';
import { IconButton } from '@/components/base/IconButton';
import { Searchbar } from '@/components/base/Searchbar';

// Web-only hint for the "/" focus shortcut (see useProductSearchShortcut);
// native has no such shortcut, so its placeholder stays plain.
const SEARCH_PLACEHOLDER = Platform.select({
  web: 'Search products ("/" to focus)',
  default: 'Search products',
});

type ProductsSearchToolbarProps = {
  searchRef?: RefObject<TextInput | null>;
  searchQuery: string;
  debouncedSearchQuery: string;
  isFetching: boolean;
  filtersExpanded: boolean;
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onToggleFilters: () => void;
};

/**
 * The only chrome above the list in the default state: search plus one
 * disclosure that opens the sort/filter chip row (ProductsFilterBar). Keeping
 * the chips behind a toggle is what gets the index under the cognitive-load
 * budget — a first-time visitor sees a search box and records.
 */
export function ProductsSearchToolbar({
  searchRef,
  searchQuery,
  debouncedSearchQuery,
  isFetching,
  filtersExpanded,
  activeFilterCount,
  onSearchChange,
  onClearSearch,
  onToggleFilters,
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
      <IconButton
        icon="sliders-horizontal"
        mode={activeFilterCount > 0 ? 'contained-tonal' : 'default'}
        onPress={onToggleFilters}
        accessibilityLabel={
          activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
        }
        // aria-* rather than accessibilityState: RN maps it to the native state,
        // and react-native-web only paints aria-expanded from this spelling.
        aria-expanded={filtersExpanded}
      />
    </View>
  );
}
