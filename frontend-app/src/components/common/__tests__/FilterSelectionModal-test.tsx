import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { renderWithProviders, setupUser } from '@/test-utils/index';
import FilterSelectionModal from '../FilterSelectionModal';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: modal interaction coverage is clearer with one shared user-event setup.
describe('FilterSelectionModal', () => {
  const user = setupUser();
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

    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
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

    expect(screen.getByText('No results')).toBeOnTheScreen();
  });

  it('toggles selections in multi-select mode', async () => {
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

    await user.press(screen.getByText('beta'));

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
    expect(screen.getByText('BrandNew')).toBeOnTheScreen();
  });

  it('calls onSelectionChange and onDismiss when add-new chip is pressed with no existing items', async () => {
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

    await user.press(screen.getByText('BrandNew'));

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

    expect(screen.getByText('No results')).toBeOnTheScreen();
  });

  it('creates a new value in single-select mode and closes', async () => {
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

    await user.press(screen.getByText('gamma'));

    expect(onSelectionChange).toHaveBeenCalledWith(['gamma']);
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeOnTheScreen();
  });
});
