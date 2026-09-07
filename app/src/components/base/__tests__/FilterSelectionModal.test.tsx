import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type React from 'react';
import FilterSelectionModal, {
  SingleSelectFilterModal,
} from '@/components/base/FilterSelectionModal';
import { renderWithProviders, setupUser } from '@/test-utils/index';

type MultiProps = React.ComponentProps<typeof FilterSelectionModal>;
type SingleProps = React.ComponentProps<typeof SingleSelectFilterModal>;

// Every test renders the modal open with a controlled, empty search; only the
// title, items, labels and the handler under assertion vary.
const renderMulti = (props: Partial<MultiProps>) =>
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
      {...props}
    />,
    { withDialog: true },
  );

const renderSingle = (props: Partial<SingleProps>) =>
  renderWithProviders(
    <SingleSelectFilterModal
      visible
      onDismiss={jest.fn()}
      title="Pick one"
      items={[]}
      value=""
      onValueChange={jest.fn()}
      searchQuery=""
      onSearchChange={jest.fn()}
      {...props}
    />,
    { withDialog: true },
  );

describe('FilterSelectionModal', () => {
  const user = setupUser();

  it('shows a loading indicator while items are being fetched', () => {
    renderMulti({ title: 'Pick one', items: [], isLoading: true });

    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
  });

  it('shows a chip by its label but still selects by its value', async () => {
    // Product types imported from CPV store the code as the name and the label
    // in `description`; filtering matches the stored name, so the value the
    // caller gets back has to stay the code.
    const onSelectionChange = jest.fn();
    renderMulti({
      title: 'Filter by product type',
      items: ['CPV: 302132'],
      labels: { 'CPV: 302132': 'Tablet computer' },
      onSelectionChange,
    });

    expect(screen.queryByText('CPV: 302132')).not.toBeOnTheScreen();
    await user.press(screen.getByText('Tablet computer'));

    expect(onSelectionChange).toHaveBeenCalledWith(['CPV: 302132']);
  });

  it('labels a selected value that is missing from the current results', () => {
    renderMulti({
      title: 'Filter by product type',
      items: ['Laptop'],
      labels: { 'CPV: 302132': 'Tablet computer' },
      selectedValues: ['CPV: 302132'],
      searchQuery: 'lap',
    });

    expect(screen.getByText('Tablet computer')).toBeOnTheScreen();
    expect(screen.queryByText('CPV: 302132')).not.toBeOnTheScreen();
  });

  it('falls back to the raw value when no label is supplied', () => {
    renderMulti({ title: 'Filter by brand', items: ['Dell'] });

    expect(screen.getByText('Dell')).toBeOnTheScreen();
  });

  it('shows an empty state when there are no results', () => {
    renderMulti({ title: 'Pick one', items: [] });

    expect(screen.getByText('No results')).toBeOnTheScreen();
  });

  it('toggles selections', async () => {
    const onSelectionChange = jest.fn();

    renderMulti({
      title: 'Pick one',
      items: ['alpha', 'beta'],
      selectedValues: ['alpha'],
      onSelectionChange,
    });

    await user.press(screen.getByText('beta'));

    expect(onSelectionChange).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('does not show an add-new chip even when search yields no matches', () => {
    renderMulti({ title: 'Filter by brand', items: [], searchQuery: 'BrandNew' });

    expect(screen.getByText('No results')).toBeOnTheScreen();
  });
});

describe('SingleSelectFilterModal', () => {
  const user = setupUser();

  it('shows add-new chip instead of "No results" when search yields no matches', () => {
    // Regression: previously the add-new chip was hidden inside the visibleItems.length > 0
    // branch, so typing a brand not in the list showed "No results" with no way to add it.
    renderSingle({ title: 'Select brand', items: [], searchQuery: 'BrandNew' });

    expect(screen.queryByText('No results')).toBeNull();
    expect(screen.getByText('BrandNew')).toBeOnTheScreen();
  });

  it('calls onValueChange and onDismiss when add-new chip is pressed with no existing items', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderSingle({
      title: 'Select brand',
      items: [],
      searchQuery: 'BrandNew',
      onValueChange,
      onDismiss,
    });

    await user.press(screen.getByText('BrandNew'));

    expect(onValueChange).toHaveBeenCalledWith('BrandNew');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('creates a new value and closes', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderSingle({
      title: 'Pick one',
      items: ['alpha'],
      searchQuery: 'gamma',
      onValueChange,
      onDismiss,
    });

    await user.press(screen.getByText('gamma'));

    expect(onValueChange).toHaveBeenCalledWith('gamma');
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeOnTheScreen();
  });

  it('selecting an existing item confirms and closes immediately', async () => {
    const onValueChange = jest.fn();
    const onDismiss = jest.fn();

    renderSingle({
      title: 'Select brand',
      items: ['alpha', 'beta'],
      onValueChange,
      onDismiss,
    });

    await user.press(screen.getByText('beta'));

    expect(onValueChange).toHaveBeenCalledWith('beta');
    expect(onDismiss).toHaveBeenCalled();
  });
});
