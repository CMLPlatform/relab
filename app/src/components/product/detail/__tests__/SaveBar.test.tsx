import { expect, jest, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { SaveBar } from '@/components/product/detail/SaveBar';
import { renderWithProviders } from '@/test-utils/index';

test('save bar shows error count and routes to the first error', () => {
  const onErrorSummaryPress = jest.fn();
  renderWithProviders(
    <SaveBar
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
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
      entityRole="product"
      editMode={false}
      isDirty={false}
      isSaving={false}
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
      entityRole="product"
      editMode={false}
      isDirty={false}
      isSaving={false}
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
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
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

test('uses component labels for component pages', () => {
  renderWithProviders(
    <SaveBar
      entityRole="component"
      editMode={false}
      isDirty={false}
      isSaving={false}
      validationValid
      ownedByMe
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Edit Component')).toBeTruthy();
});
