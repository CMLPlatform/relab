import { useCallback } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, spacing } from '@/constants';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { Chip } from './Chip';
import { OverlaySurface } from './OverlaySurface';
import { Text } from './Text';
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

type Props = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  /** Items to display; controlled by the parent (parent owns the search query + fetch). */
  items: string[];
  isLoading?: boolean;
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  /** Controlled search query; parent owns it so it can debounce/fetch. */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  /** When true: tapping an item immediately confirms and closes (single-select UX). */
  singleSelect?: boolean;
};

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
  searchPlaceholder = 'Search…',
  singleSelect = false,
}: Props) {
  const theme = useAppTheme();
  const toggle = useCallback(
    (value: string) => {
      if (singleSelect) {
        onSelectionChange([value]);
        onDismiss();
        return;
      }
      if (selectedValues.includes(value)) {
        onSelectionChange(selectedValues.filter((v) => v !== value));
      } else {
        onSelectionChange([...selectedValues, value]);
      }
    },
    [singleSelect, onSelectionChange, onDismiss, selectedValues],
  );

  const addNew = useCallback(() => toggle(searchQuery.trim()), [toggle, searchQuery]);
  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
    if (singleSelect) {
      onDismiss();
    }
  }, [onSelectionChange, singleSelect, onDismiss]);

  // Always show selected values at the top, even if not in the current search results.
  const selectedNotInResults = selectedValues.filter((v) => !items.includes(v));
  const visibleItems = [...selectedNotInResults, ...items];

  // For singleSelect, allow creating a new value from the typed search query.
  const canAddNew =
    singleSelect &&
    searchQuery.trim().length > 0 &&
    !visibleItems.some((v) => v.toLowerCase() === searchQuery.trim().toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        style={[styles.overlay, { backgroundColor: theme.tokens.overlay.scrim }]}
        onPress={onDismiss}
      >
        {/* Swallow presses so tapping inside the dialog doesn't dismiss it. */}
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogWrapper}>
          <OverlaySurface style={styles.dialog} tone="scrim">
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <TextInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={onSearchChange}
              accessibilityRole="search"
              style={[styles.search, { borderColor: theme.colors.outline }]}
            />
            {isLoading ? (
              <View style={styles.loading} accessible accessibilityRole="progressbar">
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : visibleItems.length === 0 && !canAddNew ? (
              <Text style={styles.empty}>No results</Text>
            ) : (
              <ScrollView style={styles.scroll}>
                <View style={styles.chips}>
                  {canAddNew ? (
                    // NOTE: dropped Paper's leading "+" icon — Chip's icon prop
                    // renders inside the same Text node as the label, which would
                    // break exact getByText(searchQuery) matches in callers/tests.
                    <Chip
                      key="__new__"
                      onPress={addNew}
                      accessibilityLabel={`Add "${searchQuery.trim()}"`}
                    >
                      {searchQuery.trim()}
                    </Chip>
                  ) : null}
                  {visibleItems.map((item) => (
                    <SelectableChip
                      key={item}
                      item={item}
                      selected={selectedValues.includes(item)}
                      onToggle={toggle}
                    />
                  ))}
                </View>
              </ScrollView>
            )}
            <View style={styles.actions}>
              {selectedValues.length > 0 ? (
                <AppButton variant="ghost" onPress={handleClearAll}>
                  {singleSelect ? 'Clear' : 'Clear all'}
                </AppButton>
              ) : null}
              {!singleSelect ? (
                <AppButton variant="ghost" onPress={onDismiss}>
                  Done
                </AppButton>
              ) : null}
              {singleSelect ? (
                <AppButton variant="ghost" onPress={onDismiss}>
                  Cancel
                </AppButton>
              ) : null}
            </View>
          </OverlaySurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  dialogWrapper: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
  },
  dialog: {
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  search: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  empty: {
    opacity: 0.5,
    paddingBottom: spacing.sm,
  },
  scroll: {
    maxHeight: 320,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
