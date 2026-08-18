import type { RefObject } from 'react';
import { useCallback } from 'react';
import { type TextInput, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { VARIANT_FOREGROUND_COLOR } from '@/components/base/appButtonVariants';
import { Icon } from '@/components/base/Icon';
import { Searchbar } from '@/components/base/Searchbar';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAppTheme } from '@/theme';

// Web-only hint for the "/" focus shortcut (see useProductSearchShortcut);
// native has no such shortcut, so its placeholder stays plain.
const SHORT_SEARCH_PLACEHOLDER = 'Search products';
const WIDE_SEARCH_PLACEHOLDER = 'Search products ("/" to focus)';

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
  const { isMd } = useBreakpoint();
  const { colors } = useAppTheme();
  const filterVariant = activeFilterCount > 0 ? 'tonal' : 'ghost';
  const filterForeground = VARIANT_FOREGROUND_COLOR[filterVariant](colors);
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
        placeholder={isMd ? WIDE_SEARCH_PLACEHOLDER : SHORT_SEARCH_PLACEHOLDER}
        accessibilityLabel="Search products"
        onChangeText={handleSearchChange}
        value={searchQuery}
        loading={isFetching && !!debouncedSearchQuery}
        style={{ flex: 1 }}
      />
      <AppButton
        variant={filterVariant}
        className="px-3"
        onPress={onToggleFilters}
        accessibilityLabel={
          activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
        }
        // aria-* rather than accessibilityState: RN maps it to the native state,
        // and react-native-web only paints aria-expanded from this spelling.
        aria-expanded={filtersExpanded}
      >
        <Icon name="sliders-horizontal" size="sm" color={filterForeground} />
        <AppText variant="caption" style={{ color: filterForeground }}>
          Filters
        </AppText>
      </AppButton>
    </View>
  );
}
