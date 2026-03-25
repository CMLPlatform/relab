import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import FilterSelectionModal from '../FilterSelectionModal';
import { renderWithProviders } from '@/test-utils';

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
