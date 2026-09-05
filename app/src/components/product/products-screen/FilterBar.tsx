import { type ComponentProps, useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import FilterSelectionModal from '@/components/base/FilterSelectionModal';
import { Icon, type IconName } from '@/components/base/Icon';
import { Menu } from '@/components/base/Menu';
import { MIN_TAP_TARGET } from '@/constants';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { useAppTheme } from '@/theme';
import { PRODUCTS_DATE_PRESETS } from './shared';

type FilterChipIcon = IconName;

/**
 * Filter pill combining a leading icon, label, selected state, and optional
 * trailing clear (x). The base Chip primitive only supports single trailing
 * icon, so this composes Pressable/AppText/Icon directly, matching the base
 * Chip's own internal building blocks.
 */
function FilterChip({
  icon,
  selected,
  onPress,
  onClose,
  accessibilityLabel,
  children,
}: {
  icon: FilterChipIcon;
  selected: boolean;
  onPress: () => void;
  onClose?: () => void;
  accessibilityLabel?: string;
  children: string;
}) {
  const { colors, tokens } = useAppTheme();
  const foreground = selected ? colors.primary : colors.onSurface;

  return (
    <View
      className="flex-row items-center rounded-md border pl-3 pr-2"
      style={{
        backgroundColor: selected ? tokens.surface.accent : 'transparent',
        borderColor: selected ? colors.primary : colors.outline,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? children}
        accessibilityState={{ selected }}
        className="flex-row items-center gap-1.5 py-2"
        style={{ minHeight: MIN_TAP_TARGET }}
      >
        <Icon name={icon} size="sm" color={foreground} />
        <AppText variant="caption" style={{ color: foreground }}>
          {children}
        </AppText>
      </Pressable>
      {onClose ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${children} filter`}
          hitSlop={12}
          className="ml-1 p-1"
          style={{ minHeight: MIN_TAP_TARGET }}
        >
          <Icon name="x" size={14} color={foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

type DatePreset = (typeof PRODUCTS_DATE_PRESETS)[number];

function DatePresetItem({
  preset,
  active,
  onDateChange,
  onCloseMenu,
}: {
  preset: DatePreset;
  active: boolean;
  onDateChange: (days?: string) => void;
  onCloseMenu: () => void;
}) {
  const handlePress = useCallback(() => {
    onDateChange(active ? undefined : String(preset.days));
    onCloseMenu();
  }, [active, preset.days, onDateChange, onCloseMenu]);

  return (
    <Menu.Item
      title={preset.label}
      trailingIcon={active ? 'check' : undefined}
      onPress={handlePress}
    />
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

/** Sort lives in the chip row so the toolbar stays search + one toggle. */
function SortChip({
  searchQueryURL,
  sortBy,
  sortOptions,
  menuVisible,
  onSortChange,
  onSetMenuVisible,
}: {
  searchQueryURL: string;
  sortBy: string[];
  sortOptions: readonly SortOption[];
  menuVisible: boolean;
  onSortChange: (sort: readonly string[]) => void;
  onSetMenuVisible: (visible: boolean) => void;
}) {
  const closeMenu = useCallback(() => onSetMenuVisible(false), [onSetMenuVisible]);
  const openMenu = useCallback(() => onSetMenuVisible(true), [onSetMenuVisible]);
  const currentSort = sortOptions.find((option) => sortBy.join(',') === option.value.join(','));

  return (
    <Menu
      visible={menuVisible}
      onDismiss={closeMenu}
      anchor={
        <FilterChip
          icon="arrow-down-up"
          selected={false}
          onPress={openMenu}
          accessibilityLabel={currentSort ? `Sort: ${currentSort.label}` : 'Sort products'}
        >
          {currentSort?.label ?? 'Sort'}
        </FilterChip>
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
            onCloseMenu={closeMenu}
          />
        ))}
    </Menu>
  );
}

type SelectionModalProps = ComponentProps<typeof FilterSelectionModal>;

type SortOption = {
  label: string;
  value: readonly string[];
};

type ProductsFilterBarProps = {
  isAuthenticated: boolean;
  filterMode: ProductFilter;
  searchQueryURL: string;
  sortBy: string[];
  sortOptions: readonly SortOption[];
  sortMenuVisible: boolean;
  onSortChange: (sort: readonly string[]) => void;
  onSetSortMenuVisible: (visible: boolean) => void;
  activeDatePreset: number | null;
  activeBrands: string[];
  activeProductTypes: string[];
  dateMenuVisible: boolean;
  brandModalVisible: boolean;
  typeModalVisible: boolean;
  brandResults?: SelectionModalProps['items'];
  brandsLoading: boolean;
  typeResults?: SelectionModalProps['items'];
  /** Stored name -> label, for CPV-coded types. Values stay names everywhere else. */
  typeLabels?: SelectionModalProps['labels'];
  typesLoading: boolean;
  brandSearch: string;
  typeSearch: string;
  onToggleMine: () => void;
  onClearMine: () => void;
  onSetDateMenuVisible: (visible: boolean) => void;
  onDateChange: (days?: string) => void;
  onSetBrandModalVisible: (visible: boolean) => void;
  onBrandSelectionChange: (values: string[]) => void;
  onSetBrandSearch: (value: string) => void;
  onClearBrands: () => void;
  onSetTypeModalVisible: (visible: boolean) => void;
  onTypeSelectionChange: (values: string[]) => void;
  onSetTypeSearch: (value: string) => void;
  onClearTypes: () => void;
};

export function ProductsFilterBar({
  isAuthenticated,
  filterMode,
  searchQueryURL,
  sortBy,
  sortOptions,
  sortMenuVisible,
  onSortChange,
  onSetSortMenuVisible,
  activeDatePreset,
  activeBrands,
  activeProductTypes,
  dateMenuVisible,
  brandModalVisible,
  typeModalVisible,
  brandResults,
  brandsLoading,
  typeResults,
  typeLabels,
  typesLoading,
  brandSearch,
  typeSearch,
  onToggleMine,
  onClearMine,
  onSetDateMenuVisible,
  onDateChange,
  onSetBrandModalVisible,
  onBrandSelectionChange,
  onSetBrandSearch,
  onClearBrands,
  onSetTypeModalVisible,
  onTypeSelectionChange,
  onSetTypeSearch,
  onClearTypes,
}: ProductsFilterBarProps) {
  const closeDateMenu = useCallback(() => onSetDateMenuVisible(false), [onSetDateMenuVisible]);
  const openDateMenu = useCallback(() => onSetDateMenuVisible(true), [onSetDateMenuVisible]);
  const clearDate = useCallback(() => onDateChange(undefined), [onDateChange]);
  const openBrandModal = useCallback(() => onSetBrandModalVisible(true), [onSetBrandModalVisible]);
  const closeBrandModal = useCallback(
    () => onSetBrandModalVisible(false),
    [onSetBrandModalVisible],
  );
  const openTypeModal = useCallback(() => onSetTypeModalVisible(true), [onSetTypeModalVisible]);
  const closeTypeModal = useCallback(() => onSetTypeModalVisible(false), [onSetTypeModalVisible]);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-0.5"
      >
        <SortChip
          searchQueryURL={searchQueryURL}
          sortBy={sortBy}
          sortOptions={sortOptions}
          menuVisible={sortMenuVisible}
          onSortChange={onSortChange}
          onSetMenuVisible={onSetSortMenuVisible}
        />

        <FilterChip
          icon="shapes"
          selected={activeProductTypes.length > 0}
          onPress={openTypeModal}
          onClose={activeProductTypes.length > 0 ? onClearTypes : undefined}
        >
          {activeProductTypes.length === 1
            ? (typeLabels?.[activeProductTypes[0]] ?? activeProductTypes[0])
            : activeProductTypes.length > 1
              ? `Product type (${activeProductTypes.length})`
              : 'Product type'}
        </FilterChip>

        {isAuthenticated ? (
          <FilterChip
            icon="user"
            selected={filterMode === 'mine'}
            onPress={onToggleMine}
            onClose={filterMode === 'mine' ? onClearMine : undefined}
            accessibilityLabel={
              filterMode === 'mine' ? 'Show all products' : 'Show only my products'
            }
          >
            Mine
          </FilterChip>
        ) : null}

        <Menu
          visible={dateMenuVisible}
          onDismiss={closeDateMenu}
          anchor={
            <FilterChip
              icon="calendar"
              selected={activeDatePreset !== null}
              onPress={openDateMenu}
              onClose={activeDatePreset !== null ? clearDate : undefined}
            >
              {PRODUCTS_DATE_PRESETS.find((preset) => preset.days === activeDatePreset)?.label ??
                'Date'}
            </FilterChip>
          }
        >
          {PRODUCTS_DATE_PRESETS.map((preset) => (
            <DatePresetItem
              key={preset.days}
              preset={preset}
              active={activeDatePreset === preset.days}
              onDateChange={onDateChange}
              onCloseMenu={closeDateMenu}
            />
          ))}
        </Menu>

        <FilterChip
          icon="tag"
          selected={activeBrands.length > 0}
          onPress={openBrandModal}
          onClose={activeBrands.length > 0 ? onClearBrands : undefined}
        >
          {activeBrands.length === 1
            ? activeBrands[0]
            : activeBrands.length > 1
              ? `Brand (${activeBrands.length})`
              : 'Brand'}
        </FilterChip>
      </ScrollView>

      <FilterSelectionModal
        visible={brandModalVisible}
        onDismiss={closeBrandModal}
        title="Filter by brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        selectedValues={activeBrands}
        onSelectionChange={onBrandSelectionChange}
        searchQuery={brandSearch}
        onSearchChange={onSetBrandSearch}
        searchPlaceholder="Search brands…"
      />

      <FilterSelectionModal
        visible={typeModalVisible}
        onDismiss={closeTypeModal}
        title="Filter by product type"
        items={typeResults ?? []}
        labels={typeLabels}
        isLoading={typesLoading}
        selectedValues={activeProductTypes}
        onSelectionChange={onTypeSelectionChange}
        searchQuery={typeSearch}
        onSearchChange={onSetTypeSearch}
        searchPlaceholder="Search types…"
      />
    </>
  );
}
