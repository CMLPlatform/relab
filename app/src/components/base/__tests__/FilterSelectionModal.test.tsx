import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import FilterSelectionModal, {
  SingleSelectFilterModal,
} from '@/components/base/FilterSelectionModal';
import { renderWithProviders, setupUser } from '@/test-utils/index';

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

  it('toggles selections', async () => {
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

  it('does not show an add-new chip even when search yields no matches', () => {
    renderWithProviders(
      <FilterSelectionModal
        visible
        onDismiss={jest.fn()}
        title="Filter by brand"
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
});

describe('SingleSelectFilterModal', () => {
  const user = setupUser();

  it('shows add-new chip instead of "No results" when search yields no matches', () => {
    // Regression: previously the add-new chip was hidden inside the visibleItems.length > 0
    // branch, so typing a brand not in the list showed "No results" with no way to add it.
    renderWithProviders(
      <SingleSelectFilterModal
        visible
        onDismiss={jest.fn()}
        title="Select brand"
        items={[]}
        value=""
        onValueChange={jest.fn()}
        searchQuery="BrandNew"
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    expect(screen.queryByText('No results')).toBeNull();
    expect(screen.getByText('BrandNew')).toBeOnTheScreen();
  });

  it('calls onValueChange and onDismiss when add-new chip is pressed with no existing items', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderWithProviders(
      <SingleSelectFilterModal
        visible
        onDismiss={onDismiss}
        title="Select brand"
        items={[]}
        value=""
        onValueChange={onValueChange}
        searchQuery="BrandNew"
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    await user.press(screen.getByText('BrandNew'));

    expect(onValueChange).toHaveBeenCalledWith('BrandNew');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('creates a new value and closes', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderWithProviders(
      <SingleSelectFilterModal
        visible
        onDismiss={onDismiss}
        title="Pick one"
        items={['alpha']}
        value=""
        onValueChange={onValueChange}
        searchQuery="gamma"
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    await user.press(screen.getByText('gamma'));

    expect(onValueChange).toHaveBeenCalledWith('gamma');
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeOnTheScreen();
  });

  it('selecting an existing item confirms and closes immediately', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderWithProviders(
      <SingleSelectFilterModal
        visible
        onDismiss={onDismiss}
        title="Select brand"
        items={['alpha', 'beta']}
        value=""
        onValueChange={onValueChange}
        searchQuery=""
        onSearchChange={jest.fn()}
      />,
      { withDialog: true },
    );

    await user.press(screen.getByText('beta'));

    expect(onValueChange).toHaveBeenCalledWith('beta');
    expect(onDismiss).toHaveBeenCalled();
  });
});
