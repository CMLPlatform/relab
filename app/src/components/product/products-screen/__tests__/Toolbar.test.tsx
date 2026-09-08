import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductsSearchToolbar } from '@/components/product/products-screen/Toolbar';

async function renderToolbar(props: Partial<Parameters<typeof ProductsSearchToolbar>[0]> = {}) {
  const onToggleFilters = jest.fn();
  const renderResult = await render(
    <ProductsSearchToolbar
      searchQuery=""
      debouncedSearchQuery=""
      isFetching={false}
      filtersExpanded={false}
      activeFilterCount={0}
      onSearchChange={jest.fn()}
      onClearSearch={jest.fn()}
      onToggleFilters={onToggleFilters}
      {...props}
    />,
  );
  return { onToggleFilters, ...renderResult };
}

describe('ProductsSearchToolbar filters toggle', () => {
  it('labels the search field', async () => {
    await renderToolbar();
    expect(screen.getByPlaceholderText('Search products')).toBeOnTheScreen();
    expect(screen.getByLabelText('Search products')).toBeOnTheScreen();
  });

  it('announces the collapsed state and toggles on press', async () => {
    const { onToggleFilters } = await renderToolbar();
    const toggle = screen.getByLabelText('Filters');
    expect(screen.getByText('Filters')).toBeOnTheScreen();
    expect(toggle.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(toggle);
    expect(onToggleFilters).toHaveBeenCalledTimes(1);
  });

  it('carries the active count in its name and the expanded state', async () => {
    await renderToolbar({ filtersExpanded: true, activeFilterCount: 2 });
    expect(screen.getByLabelText('Filters, 2 active').props.accessibilityState.expanded).toBe(true);
  });
});
