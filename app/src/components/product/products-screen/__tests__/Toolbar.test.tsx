import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductsSearchToolbar } from '@/components/product/products-screen/Toolbar';

function renderToolbar(props: Partial<Parameters<typeof ProductsSearchToolbar>[0]> = {}) {
  const onToggleFilters = jest.fn();
  render(
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
  return { onToggleFilters };
}

describe('ProductsSearchToolbar filters toggle', () => {
  it('announces the collapsed state and toggles on press', () => {
    const { onToggleFilters } = renderToolbar();
    const toggle = screen.getByLabelText('Filters');
    expect(toggle.props.accessibilityState.expanded).toBe(false);
    fireEvent.press(toggle);
    expect(onToggleFilters).toHaveBeenCalledTimes(1);
  });

  it('carries the active count in its name and the expanded state', () => {
    renderToolbar({ filtersExpanded: true, activeFilterCount: 2 });
    expect(screen.getByLabelText('Filters, 2 active').props.accessibilityState.expanded).toBe(true);
  });
});
