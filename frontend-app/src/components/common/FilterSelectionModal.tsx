import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, Portal, Searchbar } from 'react-native-paper';
import { Text } from '@/components/base/Text';

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
  const toggle = (value: string) => {
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
  };

  // Always show selected values at the top, even if not in the current search results.
  const selectedNotInResults = selectedValues.filter((v) => !items.includes(v));
  const visibleItems = [...selectedNotInResults, ...items];

  // For singleSelect, allow creating a new value from the typed search query.
  const canAddNew =
    singleSelect &&
    searchQuery.trim().length > 0 &&
    !visibleItems.some((v) => v.toLowerCase() === searchQuery.trim().toLowerCase());

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: '85%' }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={{ paddingBottom: 0 }}>
          <Searchbar
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChangeText={onSearchChange}
            style={{ marginBottom: 12 }}
          />
          {isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : visibleItems.length === 0 && !canAddNew ? (
            <Text style={{ opacity: 0.5, paddingBottom: 8 }}>No results</Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
                {canAddNew && (
                  <Chip key="__new__" icon="plus" mode="outlined" onPress={() => toggle(searchQuery.trim())}>
                    {searchQuery.trim()}
                  </Chip>
                )}
                {visibleItems.map((item) => {
                  const selected = selectedValues.includes(item);
                  return (
                    <Chip
                      key={item}
                      onPress={() => toggle(item)}
                      selected={selected}
                      mode={selected ? 'flat' : 'outlined'}
                    >
                      {item}
                    </Chip>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          {selectedValues.length > 0 && (
            <Button
              onPress={() => {
                onSelectionChange([]);
                if (singleSelect) onDismiss();
              }}
            >
              {singleSelect ? 'Clear' : 'Clear all'}
            </Button>
          )}
          {!singleSelect && <Button onPress={onDismiss}>Done</Button>}
          {singleSelect && <Button onPress={onDismiss}>Cancel</Button>}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
