import { type ComponentProps, useCallback } from 'react';
import { ScrollView } from 'react-native';
import { Chip, Menu } from 'react-native-paper';
import FilterSelectionModal from '@/components/base/FilterSelectionModal';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { PRODUCTS_DATE_PRESETS, productsScreenStyles as styles } from './shared';

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
          <Chip
            icon="account"
            selected={filterMode === 'mine'}
            mode={filterMode === 'mine' ? 'flat' : 'outlined'}
            onPress={onToggleMine}
            onClose={filterMode === 'mine' ? onClearMine : undefined}
            compact
            accessibilityLabel={
              filterMode === 'mine' ? 'Show all products' : 'Show only my products'
            }
          >
            Mine
          </Chip>
        ) : null}

        <Menu
          visible={dateMenuVisible}
          onDismiss={closeDateMenu}
          anchor={
            <Chip
              icon="calendar"
              selected={activeDatePreset !== null}
              mode={activeDatePreset !== null ? 'flat' : 'outlined'}
              onPress={openDateMenu}
              onClose={activeDatePreset !== null ? clearDate : undefined}
              compact
            >
              {PRODUCTS_DATE_PRESETS.find((preset) => preset.days === activeDatePreset)?.label ??
                'Date'}
            </Chip>
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

        <Chip
          icon="tag"
          selected={activeBrands.length > 0}
          mode={activeBrands.length > 0 ? 'flat' : 'outlined'}
          onPress={openBrandModal}
          onClose={activeBrands.length > 0 ? onClearBrands : undefined}
          compact
        >
          {activeBrands.length === 1
            ? activeBrands[0]
            : activeBrands.length > 1
              ? `Brand (${activeBrands.length})`
              : 'Brand'}
        </Chip>

        <Chip
          icon="shape"
          selected={activeProductTypes.length > 0}
          mode={activeProductTypes.length > 0 ? 'flat' : 'outlined'}
          onPress={openTypeModal}
          onClose={activeProductTypes.length > 0 ? onClearTypes : undefined}
          compact
        >
          {activeProductTypes.length === 1
            ? activeProductTypes[0]
            : activeProductTypes.length > 1
              ? `Type (${activeProductTypes.length})`
              : 'Type'}
        </Chip>
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
