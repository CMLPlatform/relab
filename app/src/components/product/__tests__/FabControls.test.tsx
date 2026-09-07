import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { ProductFabControls } from '@/components/product/detail/FabControls';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { mockPlatform, restorePlatform } from '@/test-utils';

jest.mock('@/components/cameras/CameraStreamPicker', () => ({
  CameraStreamPicker: () => null,
}));

// Real BOTTOM_NAV_CLEARANCE constant stays live (imported above); only the
// visibility hook is mocked, as in Chrome's and FeedbackControls' tests.
const mockUseBottomNavVisible = jest.fn();
jest.mock('@/components/base/useBottomNav', () => ({
  ...(jest.requireActual('@/components/base/useBottomNav') as object),
  useBottomNavVisible: () => mockUseBottomNavVisible(),
}));

const mockUseBreakpoint = jest.fn();
jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}));

beforeEach(() => {
  mockUseBottomNavVisible.mockReturnValue(false);
  mockUseBreakpoint.mockReturnValue({ isMd: false });
});

describe('ProductFabControls — responsive action layout', () => {
  it('uses a flow SaveBar below md in edit mode and no FAB', async () => {
    await render(<ProductFabControls {...baseProps} editMode />);

    expect(screen.getByTestId('save-bar-dock')).toBeOnTheScreen();
    expect(screen.queryByTestId('product-primary-fab')).toBeNull();
  });

  it('keeps the Edit FAB below md in view mode', async () => {
    await render(<ProductFabControls {...baseProps} />);

    expect(screen.getByTestId('product-primary-fab')).toBeOnTheScreen();
    expect(screen.queryByTestId('save-bar-dock')).toBeNull();
  });
});

const baseProps = {
  entityRole: 'product' as const,
  editMode: false,
  ownedByMe: true,
  productName: 'Test',
  fabExtended: true,
  validationValid: true,
  isSaving: false,
  isPaused: false,
  isDirty: false,
  onPrimaryFabPress: jest.fn(),
  streamPickerVisible: false,
  onDismissStreamPicker: jest.fn(),
  primaryFabIcon: 'pencil' as const,
};

function fabButton() {
  return screen.getByRole('button');
}

// Detail screens live inside a tab now, so BottomNav renders over them too —
// and on web it is viewport-fixed, escaping the container these controls are
// laid out in. Both docked controls have to lift themselves clear of it.
describe.each([
  ['the FAB below md', false, () => screen.getByRole('button')],
  ['the SaveBar dock at md', true, () => screen.getByTestId('save-bar-dock')],
])('tab-bar clearance for %s', (_label, isMd, dock) => {
  afterEach(restorePlatform);

  function dockedBottom() {
    return StyleSheet.flatten(dock().props.style).bottom as number;
  }

  it('bumps its floating offset by BOTTOM_NAV_CLEARANCE on web when BottomNav is visible', async () => {
    mockPlatform('web');
    mockUseBreakpoint.mockReturnValue({ isMd });
    const { rerender } = await render(<ProductFabControls {...baseProps} />);
    const hiddenBottom = dockedBottom();

    mockUseBottomNavVisible.mockReturnValue(true);
    await rerender(<ProductFabControls {...baseProps} />);

    expect(dockedBottom() - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  it('adds no clearance on native, where the tab bar is in normal flow', async () => {
    mockPlatform('ios');
    mockUseBreakpoint.mockReturnValue({ isMd });
    const { rerender } = await render(<ProductFabControls {...baseProps} />);
    const hiddenBottom = dockedBottom();

    mockUseBottomNavVisible.mockReturnValue(true);
    await rerender(<ProductFabControls {...baseProps} />);

    expect(dockedBottom()).toBe(hiddenBottom);
  });
});

// The FAB only ever renders below md in view mode — `isMd || editMode` sends every
// edit-mode render to SaveBar — so it has no save or validation state of its own.
// It used to carry a whole blocked-save tooltip that no render could reach.
describe('ProductFabControls — view-mode FAB', () => {
  it('labels and announces the FAB by entity role', async () => {
    await render(<ProductFabControls {...baseProps} entityRole="component" />);

    expect(screen.getByRole('button', { name: 'Edit Component' })).toBeOnTheScreen();
  });

  it('ignores validation state, which only SaveBar acts on', async () => {
    await render(<ProductFabControls {...baseProps} validationValid={false} isDirty />);

    expect(screen.getByRole('button', { name: 'Edit Product' })).toBeOnTheScreen();
    expect(fabButton().props.accessibilityState.disabled).toBe(false);
  });

  it('says the save is queued while a paused offline mutation is in flight', async () => {
    await render(<ProductFabControls {...baseProps} isSaving isPaused />);

    expect(screen.getByRole('button', { name: QUEUED_OFFLINE_LABEL })).toBeOnTheScreen();
  });

  it('disables the FAB while saving, and shows no queued label when online', async () => {
    const onPrimaryFabPress = jest.fn();
    await render(
      <ProductFabControls {...baseProps} isSaving onPrimaryFabPress={onPrimaryFabPress} />,
    );

    expect(screen.getByRole('button', { name: 'Edit Product' })).toBeOnTheScreen();
    expect(fabButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(fabButton());
    expect(onPrimaryFabPress).not.toHaveBeenCalled();
  });
});
