import { type ComponentProps, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import FilterSelectionModal from '@/components/base/FilterSelectionModal';
import { Icon, type IconName } from '@/components/base/Icon';
import { Menu } from '@/components/base/Menu';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { useAppTheme } from '@/theme';
import { PRODUCTS_DATE_PRESETS, productsScreenStyles as styles } from './shared';

type FilterChipIcon = IconName;

/**
 * Filter pill combining a leading icon, label, selected state, and an
 * optional trailing clear (x) — react-native-paper's Chip had all four built
 * in; the base Chip primitive only supports a single trailing icon slot, so
 * this composes Pressable/AppText/Icon directly, matching the base Chip's
 * own internal building blocks.
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
  const { colors } = useAppTheme();
  const foreground = selected ? colors.onPrimaryContainer : colors.onSurface;

  return (
    <View
      className="flex-row items-center rounded-md border pl-3 pr-2"
      style={{
        backgroundColor: selected ? colors.primaryContainer : 'transparent',
        borderColor: selected ? colors.primaryContainer : colors.outline,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? children}
        accessibilityState={{ selected }}
        className="flex-row items-center gap-1.5 py-[7px]"
      >
        <Icon name={icon} size="sm" color={foreground} />
        <AppText style={[filterChipStyles.label, { color: foreground }]}>{children}</AppText>
      </Pressable>
      {onClose ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${children} filter`}
          hitSlop={8}
          className="ml-1 p-1"
        >
          <Icon name="close" size={14} color={foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const filterChipStyles = StyleSheet.create({
  // AppText's own inline typography scale always wins over a className, so a
  // text-sm class here would be a silent no-op — fontSize stays style-driven.
  label: {
    fontSize: 14,
  },
});

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

type SelectionModalProps = ComponentProps<typeof FilterSelectionModal>;

type ProductsFilterBarProps = {
  isAuthenticated: boolean;
  filterMode: ProductFilter;
  activeDatePreset: number | null;
  activeBrands: string[];
  activeProductTypes: string[];
  dateMenuVisible: boolean;
  brandModalVisible: boolean;
  typeModalVisible: boolean;
  brandResults?: SelectionModalProps['items'];
  brandsLoading: boolean;
  typeResults?: SelectionModalProps['items'];
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
  activeDatePreset,
  activeBrands,
  activeProductTypes,
  dateMenuVisible,
  brandModalVisible,
  typeModalVisible,
  brandResults,
  brandsLoading,
  typeResults,
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
        contentContainerStyle={styles.filterScrollContent}
      >
        {isAuthenticated ? (
          <FilterChip
            icon="account"
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

        <FilterChip
          icon="shape"
          selected={activeProductTypes.length > 0}
          onPress={openTypeModal}
          onClose={activeProductTypes.length > 0 ? onClearTypes : undefined}
        >
          {activeProductTypes.length === 1
            ? activeProductTypes[0]
            : activeProductTypes.length > 1
              ? `Type (${activeProductTypes.length})`
              : 'Type'}
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
