import { expect, jest, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SaveBar } from '@/components/product/detail/SaveBar';
import { queryAllHostsByType, renderWithProviders } from '@/test-utils/index';

test('flow layout fills available width, wraps content, and is not positioned', async () => {
  await renderWithProviders(
    <SaveBar
      layout="flow"
      bottomOffset={60}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      errorCount={12}
      onPrimaryPress={jest.fn()}
      ownedByMe
    />,
  );

  const style = StyleSheet.flatten(screen.getByTestId('save-bar-dock').props.style);
  expect(style).toEqual(
    expect.objectContaining({ width: '100%', flexWrap: 'wrap', marginBottom: 60 }),
  );
  expect(style.position).toBeUndefined();
  expect(style.right).toBeUndefined();
  expect(style.bottom).toBeUndefined();
});

test('save bar shows error count and routes to the first error', async () => {
  const onErrorSummaryPress = jest.fn();
  await renderWithProviders(
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
  await fireEvent.press(screen.getByText('3 fields need attention'));
  expect(onErrorSummaryPress).toHaveBeenCalled();
});

test('read mode renders a single Edit action', async () => {
  await renderWithProviders(
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

test('not owned by me renders nothing', async () => {
  await renderWithProviders(
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

test('dirty edits with invalid validation and no error count block the save press', async () => {
  const onPrimaryPress = jest.fn();
  await renderWithProviders(
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
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
});

test('needsAttention state routes the primary button press to the error summary, not save', async () => {
  const onPrimaryPress = jest.fn();
  const onErrorSummaryPress = jest.fn();
  await renderWithProviders(
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
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
  expect(onErrorSummaryPress).toHaveBeenCalledTimes(1);
});

// TDD for the offline-queued acknowledgment: a paused save mutation shows a
// short "queued" label and drops the spinner instead of loading forever.
test('shows a queued label and no spinner while the save mutation is paused offline', async () => {
  await renderWithProviders(
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
  expect(queryAllHostsByType('ActivityIndicator')).toHaveLength(0);
});

test('shows the loading spinner while actually saving (not paused)', async () => {
  await renderWithProviders(
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
  expect(queryAllHostsByType('ActivityIndicator').length).toBeGreaterThan(0);
});

test('uses component labels for component pages', async () => {
  await renderWithProviders(
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

// These cases used to live in FabControls.test.tsx, rendering ProductFabControls
// with editMode — which `isMd || editMode` routes straight to this component.
test('edit mode with no edits yet stays pressable even while invalid', async () => {
  const onPrimaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty={false}
      isSaving={false}
      isPaused={false}
      validationValid={false}
      validationError="Type is required"
      onPrimaryPress={onPrimaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).toHaveBeenCalledTimes(1);
});

test('valid dirty edits save on press', async () => {
  const onPrimaryPress = jest.fn();
  const onErrorSummaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid
      errorCount={0}
      onPrimaryPress={onPrimaryPress}
      onErrorSummaryPress={onErrorSummaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).toHaveBeenCalledTimes(1);
  expect(onErrorSummaryPress).not.toHaveBeenCalled();
});

// A second press mid-flight would fire the mutation twice. The spinner blocks
// this one; the queued case below has no spinner and relies on `disabled`.
test('blocks the press while a save is already in flight', async () => {
  const onPrimaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={false}
      validationValid
      onPrimaryPress={onPrimaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
});

// Queued offline drops the spinner, so the button reads as pressable — only
// `disabled` stops a second press from queueing the mutation twice.
test('blocks the press while the save sits queued offline', async () => {
  const onPrimaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={true}
      validationValid
      onPrimaryPress={onPrimaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Queued — sends when online'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
});

test('uses singular phrasing for a single error', async () => {
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      errorCount={1}
      onPrimaryPress={jest.fn()}
      ownedByMe
    />,
  );
  expect(screen.getByText('1 field needs attention')).toBeTruthy();
});

// errorCount 0 is not "no errors" — it is an invalid form whose error summary
// has nothing to route to, so the press is blocked rather than redirected.
test('blocks the press when invalid with a zero error count', async () => {
  const onPrimaryPress = jest.fn();
  const onErrorSummaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      errorCount={0}
      onPrimaryPress={onPrimaryPress}
      onErrorSummaryPress={onErrorSummaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
  expect(onErrorSummaryPress).not.toHaveBeenCalled();
});

// Blocked with no message to show: the button still has to refuse the press,
// and the bar must not render an empty error slot in its place.
test('blocks the press with no inline message when the form supplies no validation error', async () => {
  const onPrimaryPress = jest.fn();
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={false}
      isPaused={false}
      validationValid={false}
      onPrimaryPress={onPrimaryPress}
      ownedByMe
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
  expect(screen.queryByText('Name is required')).toBeNull();
});

// Flow layout stacks: the inline error takes a full row so it wraps below the
// button instead of squeezing it. The floating layout lets it sit inline.
test('gives the inline validation error its own row in flow layout only', async () => {
  const props = {
    bottomOffset: 0,
    entityRole: 'product' as const,
    editMode: true,
    isDirty: true,
    isSaving: false,
    isPaused: false,
    validationValid: false,
    validationError: 'Name is required',
    onPrimaryPress: jest.fn(),
    ownedByMe: true,
  };

  const flow = await renderWithProviders(<SaveBar layout="flow" {...props} />);
  expect(StyleSheet.flatten(flow.getByTestId('save-bar-validation-error').props.style)).toEqual(
    expect.objectContaining({ flexBasis: '100%' }),
  );

  const floating = await renderWithProviders(<SaveBar {...props} />);
  expect(
    StyleSheet.flatten(floating.getByTestId('save-bar-validation-error').props.style),
  ).toBeUndefined();
});
