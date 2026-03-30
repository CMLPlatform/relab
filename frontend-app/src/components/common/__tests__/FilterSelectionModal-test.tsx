import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import FilterSelectionModal from '../FilterSelectionModal';

describe('FilterSelectionModal', () => {
  it('shows a loading indicator while items are being fetched', () => {
    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Pick one"
        items={[]}
        isLoading
        selectedValues={[]}
        onSelectionChange={jest.fn()}
        searchQuery=""
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('shows an empty state when there are no results', () => {
    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Pick one"
        items={[]}
        selectedValues={[]}
        onSelectionChange={jest.fn()}
        searchQuery=""
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('toggles selections in multi-select mode', () => {
    const onSelectionChange = jest.fn();

    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Pick one"
        items={['alpha', 'beta']}
        selectedValues={['alpha']}
        onSelectionChange={onSelectionChange}
        searchQuery=""
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByText('beta'));

    expect(onSelectionChange).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('shows add-new chip instead of "No results" in singleSelect mode when search yields no matches', () => {
    // Regression: previously the add-new chip was hidden inside the visibleItems.length > 0
    // branch, so typing a brand not in the list showed "No results" with no way to add it.
    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Select Brand"
        items={[]}
        selectedValues={[]}
        onSelectionChange={jest.fn()}
        searchQuery="BrandNew"
        onSearchChange={jest.fn()}
        singleSelect
      />,
      { withDialog: true },
    );

    expect(screen.queryByText('No results')).toBeNull();
    expect(screen.getByText('BrandNew')).toBeTruthy();
  });

  it('calls onSelectionChange and onDismiss when add-new chip is pressed with no existing items', () => {
    const onSelectionChange = jest.fn();
    const onDismiss = jest.fn();

    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={onDismiss}
        title="Select Brand"
        items={[]}
        selectedValues={[]}
        onSelectionChange={onSelectionChange}
        searchQuery="BrandNew"
        onSearchChange={jest.fn()}
        singleSelect
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByText('BrandNew'));

    expect(onSelectionChange).toHaveBeenCalledWith(['BrandNew']);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('does not show add-new chip in multi-select mode even when search yields no matches', () => {
    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Filter by Brand"
        items={[]}
        selectedValues={[]}
        onSelectionChange={jest.fn()}
        searchQuery="BrandNew"
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('creates a new value in single-select mode and closes', () => {
    const onSelectionChange = jest.fn();
    const onDismiss = jest.fn();

    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={onDismiss}
        title="Pick one"
        items={['alpha']}
        selectedValues={[]}
        onSelectionChange={onSelectionChange}
        searchQuery="gamma"
        onSearchChange={jest.fn()}
        singleSelect
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByText('gamma'));

    expect(onSelectionChange).toHaveBeenCalledWith(['gamma']);
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
