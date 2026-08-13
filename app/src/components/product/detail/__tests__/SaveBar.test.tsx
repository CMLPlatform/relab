import { expect, jest, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { SaveBar } from '@/components/product/detail/SaveBar';
import { renderWithProviders } from '@/test-utils/index';

test('save bar shows error count and routes to the first error', () => {
  const onErrorSummaryPress = jest.fn();
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      errorCount={3}
      onErrorSummaryPress={onErrorSummaryPress}
      onPrimaryPress={jest.fn()}
      ownedByMe
    />,
  );
  fireEvent.press(screen.getByText('3 fields need attention'));
  expect(onErrorSummaryPress).toHaveBeenCalled();
});

test('read mode renders a single Edit action', () => {
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode={false}
      isDirty={false}
      isSaving={false}
      isPaused={false}
      validationValid
      ownedByMe
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Edit Product')).toBeTruthy();
});

test('not owned by me renders nothing', () => {
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode={false}
      isDirty={false}
      isSaving={false}
      isPaused={false}
      validationValid
      ownedByMe={false}
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.queryByText('Edit Product')).toBeNull();
});

test('dirty edits with invalid validation and no error count block the save press', () => {
  const onPrimaryPress = jest.fn();
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      validationError="Name is required"
      onPrimaryPress={onPrimaryPress}
      ownedByMe
    />,
  );
  expect(screen.getByText('Name is required')).toBeTruthy();
  fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
});

test('needsAttention state routes the primary button press to the error summary, not save', () => {
  const onPrimaryPress = jest.fn();
  const onErrorSummaryPress = jest.fn();
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      errorCount={2}
      onPrimaryPress={onPrimaryPress}
      onErrorSummaryPress={onErrorSummaryPress}
      ownedByMe
    />,
  );
  fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
  expect(onErrorSummaryPress).toHaveBeenCalledTimes(1);
});

// TDD for the offline-queued acknowledgment: a paused save mutation shows a
// short "queued" label and drops the spinner instead of loading forever.
test('shows a queued label and no spinner while the save mutation is paused offline', () => {
  const { UNSAFE_root } = renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={true}
      validationValid
      ownedByMe
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Queued — sends when online')).toBeTruthy();
  expect(UNSAFE_root.findAllByType(ActivityIndicator)).toHaveLength(0);
});

test('shows the loading spinner while actually saving (not paused)', () => {
  const { UNSAFE_root } = renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={false}
      validationValid
      ownedByMe
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Save Product')).toBeTruthy();
  expect(UNSAFE_root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
});

test('uses component labels for component pages', () => {
  renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="component"
      editMode={false}
      isDirty={false}
      isSaving={false}
      isPaused={false}
      validationValid
      ownedByMe
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Edit Component')).toBeTruthy();
});
