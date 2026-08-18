import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductsFilterBar } from '@/components/product/products-screen/FilterBar';

const SORT_OPTIONS = [
  { label: 'Relevance', value: [] },
  { label: 'Newest first', value: ['-created_at'] },
  { label: 'Oldest first', value: ['+created_at'] },
] as const;

function renderFilterBar(props: Partial<Parameters<typeof ProductsFilterBar>[0]> = {}) {
  const onSortChange = jest.fn();
  const onSetSortMenuVisible = jest.fn();
  render(
    <ProductsFilterBar
      isAuthenticated={false}
      filterMode="all"
      activeDatePreset={null}
      activeBrands={[]}
      activeProductTypes={[]}
      searchQueryURL=""
      sortBy={['-created_at']}
      sortOptions={SORT_OPTIONS}
      sortMenuVisible={false}
      dateMenuVisible={false}
      brandModalVisible={false}
      typeModalVisible={false}
      brandsLoading={false}
      typesLoading={false}
      brandSearch=""
      typeSearch=""
      onSortChange={onSortChange}
      onSetSortMenuVisible={onSetSortMenuVisible}
      onToggleMine={jest.fn()}
      onClearMine={jest.fn()}
      onSetDateMenuVisible={jest.fn()}
      onDateChange={jest.fn()}
      onSetBrandModalVisible={jest.fn()}
      onBrandSelectionChange={jest.fn()}
      onSetBrandSearch={jest.fn()}
      onClearBrands={jest.fn()}
      onSetTypeModalVisible={jest.fn()}
      onTypeSelectionChange={jest.fn()}
      onSetTypeSearch={jest.fn()}
      onClearTypes={jest.fn()}
      {...props}
    />,
  );
  return { onSortChange, onSetSortMenuVisible };
}

describe('ProductsFilterBar sort chip', () => {
  it('names the current sort and opens the menu on press', () => {
    const { onSetSortMenuVisible } = renderFilterBar();
    const chip = screen.getByLabelText('Sort: Newest first');
    expect(screen.getByText('Newest first')).toBeOnTheScreen();
    fireEvent.press(chip);
    expect(onSetSortMenuVisible).toHaveBeenCalledWith(true);
  });

  it('applies the chosen sort from the open menu', () => {
    const { onSortChange, onSetSortMenuVisible } = renderFilterBar({ sortMenuVisible: true });
    fireEvent.press(screen.getByText('Oldest first'));
    expect(onSortChange).toHaveBeenCalledWith(['+created_at']);
    expect(onSetSortMenuVisible).toHaveBeenCalledWith(false);
  });

  it('offers Relevance only while a search query is applied', () => {
    renderFilterBar({ sortMenuVisible: true });
    expect(screen.queryByText('Relevance')).toBeNull();
  });
});
