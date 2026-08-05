import { type ReactNode, useCallback } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Chip } from './Chip';
import { OverlaySurface } from './OverlaySurface';
import { TextInput } from './TextInput';

function SelectableChip({
  item,
  selected,
  onToggle,
}: {
  item: string;
  selected: boolean;
  onToggle: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const handlePress = useCallback(() => onToggle(item), [onToggle, item]);
  return (
    <Chip
      onPress={handlePress}
      style={selected ? { borderWidth: 2, borderColor: colors.primary } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {item}
    </Chip>
  );
}

type ShellProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  /** Items to display; controlled by the parent (parent owns the search query + fetch). */
  items: string[];
  isLoading?: boolean;
  selectedValues: string[];
  onToggle: (value: string) => void;
  /** Controlled search query; parent owns it so it can debounce/fetch. */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  /** Extra leading chip that lets the user add a value not present in `items`. */
  addNewChip?: { label: string; onPress: () => void };
  footer: ReactNode;
};

/**
 * Presentational core shared by the multi-select and single-select filter
 * modals: search field, chip list, loading/empty states. Selection semantics
 * (toggle behavior, add-new, footer actions) are owned by each variant.
 */
function FilterModalShell({
  visible,
  onDismiss,
  title,
  items,
  isLoading,
  selectedValues,
  onToggle,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search…',
  addNewChip,
  footer,
}: ShellProps) {
  const theme = useAppTheme();

  // Always show selected values at the top, even if not in the current search results.
  const selectedNotInResults = selectedValues.filter((v) => !items.includes(v));
  const visibleItems = [...selectedNotInResults, ...items];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: theme.tokens.overlay.scrim }}
        onPress={onDismiss}
      >
        {/* Swallow presses so tapping inside the dialog doesn't dismiss it. */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full"
          style={styles.dialogWrapper}
        >
          <OverlaySurface className="p-4" tone="surface">
            <AppText
              variant="plain"
              accessibilityRole="header"
              className="mb-2 font-semibold"
              style={{ fontSize: 18 }}
            >
              {title}
            </AppText>
            <TextInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={onSearchChange}
              accessibilityRole="search"
              className="mb-4 border px-2 py-2"
              style={{ borderColor: theme.colors.outline }}
            />
            {isLoading ? (
              <View
                className="items-center py-6"
                accessible
                accessibilityRole="progressbar"
                accessibilityState={{ busy: true }}
              >
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : visibleItems.length === 0 && !addNewChip ? (
              <AppText variant="plain" className="pb-2 opacity-50">
                No results
              </AppText>
            ) : (
              <ScrollView style={styles.scroll}>
                <View className="flex-row flex-wrap gap-2 pb-2">
                  {addNewChip ? (
                    // NOTE: dropped Paper's leading "+" icon — Chip's icon prop
                    // renders inside the same AppText node as the label, which would
                    // break exact getByText(searchQuery) matches in callers/tests.
                    <Chip
                      key="__new__"
                      onPress={addNewChip.onPress}
                      accessibilityLabel={`Add "${addNewChip.label}"`}
                    >
                      {addNewChip.label}
                    </Chip>
                  ) : null}
                  {visibleItems.map((item) => (
                    <SelectableChip
                      key={item}
                      item={item}
                      selected={selectedValues.includes(item)}
                      onToggle={onToggle}
                    />
                  ))}
                </View>
              </ScrollView>
            )}
            <View className="mt-2 flex-row justify-end gap-1">{footer}</View>
          </OverlaySurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  items: string[];
  isLoading?: boolean;
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
};

/** Multi-select filter modal: tapping a chip toggles it in `selectedValues`. */
export default function FilterSelectionModal({
  visible,
  onDismiss,
  title,
  items,
  isLoading,
  selectedValues,
  onSelectionChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
}: Props) {
  const toggle = useCallback(
    (value: string) => {
      if (selectedValues.includes(value)) {
        onSelectionChange(selectedValues.filter((v) => v !== value));
      } else {
        onSelectionChange([...selectedValues, value]);
      }
    },
    [onSelectionChange, selectedValues],
  );
  const handleClearAll = useCallback(() => onSelectionChange([]), [onSelectionChange]);

  return (
    <FilterModalShell
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      items={items}
      isLoading={isLoading}
      selectedValues={selectedValues}
      onToggle={toggle}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      footer={
        <>
          {selectedValues.length > 0 ? (
            <AppButton variant="ghost" onPress={handleClearAll}>
              Clear all
            </AppButton>
          ) : null}
          <AppButton variant="ghost" onPress={onDismiss}>
            Done
          </AppButton>
        </>
      }
    />
  );
}

type SingleSelectProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  items: string[];
  isLoading?: boolean;
  /** Currently selected value, or '' when none is set. */
  value: string;
  onValueChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
};

/**
 * Single-select filter modal: tapping a chip immediately confirms the value
 * and closes. Also lets the user add a value typed in the search box that
 * isn't among `items`.
 */
export function SingleSelectFilterModal({
  visible,
  onDismiss,
  title,
  items,
  isLoading,
  value,
  onValueChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
}: SingleSelectProps) {
  const selectedValues = value ? [value] : [];
  const selectValue = useCallback(
    (next: string) => {
      onValueChange(next);
      onDismiss();
    },
    [onValueChange, onDismiss],
  );
  const handleClear = useCallback(() => {
    onValueChange('');
    onDismiss();
  }, [onValueChange, onDismiss]);

  const trimmedQuery = searchQuery.trim();
  const canAddNew =
    trimmedQuery.length > 0 &&
    !items.some((v) => v.toLowerCase() === trimmedQuery.toLowerCase()) &&
    trimmedQuery.toLowerCase() !== value.toLowerCase();
  const addNew = useCallback(() => selectValue(trimmedQuery), [selectValue, trimmedQuery]);

  return (
    <FilterModalShell
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      items={items}
      isLoading={isLoading}
      selectedValues={selectedValues}
      onToggle={selectValue}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      addNewChip={canAddNew ? { label: trimmedQuery, onPress: addNew } : undefined}
      footer={
        <>
          {value ? (
            <AppButton variant="ghost" onPress={handleClear}>
              Clear
            </AppButton>
          ) : null}
          <AppButton variant="ghost" onPress={onDismiss}>
            Cancel
          </AppButton>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  dialogWrapper: {
    maxWidth: 480,
    maxHeight: '85%',
  },
  scroll: {
    // No exact Tailwind step for 320.
    maxHeight: 320,
  },
});
