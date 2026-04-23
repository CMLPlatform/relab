import { ScrollView } from 'react-native';
import { Chip, Menu } from 'react-native-paper';
import FilterSelectionModal from '@/components/common/FilterSelectionModal';
import { PRODUCTS_DATE_PRESETS, productsScreenStyles as styles } from './shared';
import type { ProductsFilterBarProps } from './types';

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
          onDismiss={() => onSetDateMenuVisible(false)}
          anchor={
            <Chip
              icon="calendar"
              selected={activeDatePreset !== null}
              mode={activeDatePreset !== null ? 'flat' : 'outlined'}
              onPress={() => onSetDateMenuVisible(true)}
              onClose={activeDatePreset !== null ? () => onDateChange(undefined) : undefined}
              compact
            >
              {PRODUCTS_DATE_PRESETS.find((preset) => preset.days === activeDatePreset)?.label ??
                'Date'}
            </Chip>
          }
        >
          {PRODUCTS_DATE_PRESETS.map((preset) => (
            <Menu.Item
              key={preset.days}
              title={preset.label}
              trailingIcon={activeDatePreset === preset.days ? 'check' : undefined}
              onPress={() => {
                onDateChange(activeDatePreset === preset.days ? undefined : String(preset.days));
                onSetDateMenuVisible(false);
              }}
            />
          ))}
        </Menu>

        <Chip
          icon="tag"
          selected={activeBrands.length > 0}
          mode={activeBrands.length > 0 ? 'flat' : 'outlined'}
          onPress={() => onSetBrandModalVisible(true)}
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
          onPress={() => onSetTypeModalVisible(true)}
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
        onDismiss={() => onSetBrandModalVisible(false)}
        title="Filter by Brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        selectedValues={activeBrands}
        onSelectionChange={onBrandSelectionChange}
        searchQuery={brandSearch}
        onSearchChange={onSetBrandSearch}
        searchPlaceholder="Search brands..."
      />

      <FilterSelectionModal
        visible={typeModalVisible}
        onDismiss={() => onSetTypeModalVisible(false)}
        title="Filter by Product Type"
        items={typeResults ?? []}
        isLoading={typesLoading}
        selectedValues={activeProductTypes}
        onSelectionChange={onTypeSelectionChange}
        searchQuery={typeSearch}
        onSearchChange={onSetTypeSearch}
        searchPlaceholder="Search types..."
      />
    </>
  );
}
