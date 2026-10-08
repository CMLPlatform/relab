import { afterEach, expect, jest, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SaveBar } from '@/components/product/detail/SaveBar';
import { getImageUploadProgress } from '@/services/api/saving';
import {
  mockPlatform,
  queryAllHostsByType,
  renderWithProviders,
  restorePlatform,
} from '@/test-utils/index';

jest.mock('@/services/api/saving', () => ({
  getImageUploadProgress: jest.fn(() => null),
  subscribeToImageUploadProgress: jest.fn(() => () => {}),
}));

afterEach(() => {
  jest.mocked(getImageUploadProgress).mockReturnValue(null);
});

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
      canModerate
    />,
  );

  const style = StyleSheet.flatten(screen.getByTestId('save-bar-dock').props.style);
  expect(style).toEqual(expect.objectContaining({ width: '100%', marginBottom: 60 }));
  expect(StyleSheet.flatten(screen.getByTestId('save-bar-row').props.style)).toEqual(
    expect.objectContaining({ flexWrap: 'wrap' }),
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
      canModerate
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: '3 fields need attention' }));
  expect(onErrorSummaryPress).toHaveBeenCalled();
  // The summary also lands in the polite status region, so it is heard when it appears.
  expect(screen.getByTestId('save-bar-status')).toHaveTextContent('3 fields need attention');
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
      canModerate
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
      canModerate={false}
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
      canModerate
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
      canModerate
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
  expect(onErrorSummaryPress).toHaveBeenCalledTimes(1);
});

// A paused save mutation shows a
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
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Queued — sends when online')).toBeTruthy();
  expect(queryAllHostsByType('ActivityIndicator')).toHaveLength(0);
});

// Photos upload sequentially after the entity PATCH lands, so a
// multi-photo save gets a progress count instead of sitting behind one mute spinner.
test('shows per-photo progress while photos upload mid-save', async () => {
  jest.mocked(getImageUploadProgress).mockReturnValue({ current: 2, total: 5 });
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={false}
      validationValid
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  // Once on the button, once in the polite status region.
  expect(screen.getAllByText('Uploading 2 of 5…')).toHaveLength(2);
  expect(screen.getByTestId('upload-progress', { includeHiddenElements: true })).toBeTruthy();
});

test('ignores upload progress while the save is paused offline', async () => {
  jest.mocked(getImageUploadProgress).mockReturnValue({ current: 2, total: 5 });
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving={true}
      isPaused={true}
      validationValid
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Queued — sends when online')).toBeTruthy();
  expect(screen.queryByText('Uploading 2 of 5…')).toBeNull();
  expect(screen.queryByTestId('upload-progress', { includeHiddenElements: true })).toBeNull();
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
      canModerate
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
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByText('Edit Component')).toBeTruthy();
});

// ProductFabControls routes every editMode render straight to this component
// (`isMd || editMode`), so its edit-mode cases live here.
test('edit mode with nothing unsaved reads Done and stays pressable even while invalid', async () => {
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
      canModerate
    />,
  );
  expect(screen.queryByText('Save Product')).toBeNull();
  await fireEvent.press(screen.getByText('Done'));
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
      canModerate
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
      canModerate
    />,
  );
  await fireEvent.press(screen.getByText('Save Product'));
  expect(onPrimaryPress).not.toHaveBeenCalled();
});

// Queued offline drops the spinner, so the button reads as pressable; only
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
      canModerate
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
      canModerate
    />,
  );
  expect(screen.getByRole('button', { name: '1 field needs attention' })).toBeOnTheScreen();
});

// errorCount 0 is not "no errors"; it is an invalid form whose error summary
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
      canModerate
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
      canModerate
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
    canModerate: true,
  };

  const flow = await renderWithProviders(<SaveBar layout="flow" {...props} />);
  expect(StyleSheet.flatten(flow.getByTestId('save-bar-status').props.style)).toEqual(
    expect.objectContaining({ flexBasis: '100%' }),
  );

  const floating = await renderWithProviders(<SaveBar {...props} />);
  expect(StyleSheet.flatten(floating.getByTestId('save-bar-status').props.style)).toBeUndefined();
});

test('announces upload progress through a polite status region', async () => {
  jest.mocked(getImageUploadProgress).mockReturnValue({ current: 1, total: 3 });
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving
      isPaused={false}
      validationValid
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  const region = screen.getByTestId('save-bar-status');
  expect(region.props.accessibilityLiveRegion).toBe('polite');
  expect(region).toHaveTextContent('Uploading 1 of 3…');
});

test('announces upload progress on iOS, where live regions do nothing', async () => {
  mockPlatform('ios');
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  jest.mocked(getImageUploadProgress).mockReturnValue({ current: 1, total: 3 });
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode
      isDirty
      isSaving
      isPaused={false}
      validationValid
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(announce).toHaveBeenCalledWith('Uploading 1 of 3…');
  announce.mockRestore();
  restorePlatform();
});

test('announces the attention summary on iOS, where live regions do nothing', async () => {
  mockPlatform('ios');
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
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
      onPrimaryPress={jest.fn()}
      canModerate
    />,
  );
  expect(announce).toHaveBeenCalledWith('2 fields need attention');
  announce.mockRestore();
  restorePlatform();
});

test('announces the validation message through the status region', async () => {
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
      onPrimaryPress={jest.fn()}
      canModerate
    />,
  );
  expect(screen.getByTestId('save-bar-status')).toHaveTextContent('Name is required');
});

test('keeps the status region mounted and empty when there is nothing to say', async () => {
  await renderWithProviders(
    <SaveBar
      bottomOffset={0}
      entityRole="product"
      editMode={false}
      isDirty={false}
      isSaving={false}
      isPaused={false}
      validationValid
      canModerate
      onPrimaryPress={jest.fn()}
    />,
  );
  expect(screen.getByTestId('save-bar-status')).toHaveTextContent('');
});
