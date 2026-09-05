import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { ProductFabControls } from '@/components/product/detail/FabControls';
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
  it('uses a flow SaveBar below md in edit mode and no FAB', () => {
    render(<ProductFabControls {...baseProps} editMode />);

    expect(screen.getByTestId('save-bar-dock')).toBeOnTheScreen();
    expect(screen.queryByTestId('product-primary-fab')).toBeNull();
  });

  it('keeps the Edit FAB below md in view mode', () => {
    render(<ProductFabControls {...baseProps} />);

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

describe('ProductFabControls — primary FAB enabled state', () => {
  it('enables the FAB in edit mode with no edits, even when validation fails', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={false}
        validationValid={false}
        validationError="Type is required"
      />,
    );
    expect(fabButton().props.accessibilityState.disabled).toBe(false);
    // No tooltip because we're not actually trying to save
    expect(screen.queryByTestId('tooltip')).toBeNull();
  });

  // Invalid with no known error count (errorCount unset) has no error summary
  // to route to, so the FAB blocks the save outright; the tooltip explains why.
  // Once errorCount is known and > 0, the FAB stays pressable to route to the
  // error summary instead (see the errorCount describe block).
  it('blocks the phone flow action and explains invalid dirty edits with no known error count', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={false}
        validationError="Name is required"
      />,
    );
    expect(fabButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Name is required')).toBeOnTheScreen();
  });

  it('enables the FAB when dirty edits are valid', () => {
    render(
      <ProductFabControls {...baseProps} editMode={true} isDirty={true} validationValid={true} />,
    );
    expect(fabButton().props.accessibilityState.disabled).toBe(false);
  });

  it('disables the FAB while saving regardless of dirty/valid state', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={true}
        isSaving={true}
      />,
    );
    expect(fabButton().props.accessibilityState.disabled).toBe(true);
  });

  it('enables the FAB in view mode (validation is irrelevant)', () => {
    render(<ProductFabControls {...baseProps} editMode={false} validationValid={false} />);
    expect(fabButton().props.accessibilityState.disabled).toBe(false);
  });

  it('uses component labels for component pages', () => {
    render(<ProductFabControls {...baseProps} entityRole="component" editMode={false} />);
    expect(screen.getByText('Edit Component')).toBeOnTheScreen();
  });

  // TDD for the offline-queued acknowledgment: a paused save mutation labels
  // the FAB "Queued — sends when online" instead of the usual Save/Edit copy.
  it('shows a queued label while the save mutation is paused offline', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={true}
        isSaving={true}
        isPaused={true}
      />,
    );
    expect(screen.getByText('Queued — sends when online')).toBeOnTheScreen();
  });
});

describe('ProductFabControls — error summary routing', () => {
  it('labels the FAB with the plural error count and routes press to onErrorSummaryPress', () => {
    const onPrimaryFabPress = jest.fn();
    const onErrorSummaryPress = jest.fn();
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={false}
        validationError="Name is required"
        errorCount={2}
        onPrimaryFabPress={onPrimaryFabPress}
        onErrorSummaryPress={onErrorSummaryPress}
      />,
    );
    expect(screen.getByText('2 fields need attention')).toBeOnTheScreen();
    const saveButton = screen.getByRole('button', { name: 'Save Product' });
    expect(saveButton.props.accessibilityState.disabled).toBe(false);

    fireEvent.press(saveButton);
    expect(onErrorSummaryPress).toHaveBeenCalledTimes(1);
    expect(onPrimaryFabPress).not.toHaveBeenCalled();
  });

  it('uses singular phrasing for a single error', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={false}
        errorCount={1}
      />,
    );
    expect(screen.getByText('1 field needs attention')).toBeOnTheScreen();
  });

  it('disables the FAB and blocks the press when invalid with a zero error count', () => {
    const onPrimaryFabPress = jest.fn();
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={false}
        errorCount={0}
        onPrimaryFabPress={onPrimaryFabPress}
      />,
    );
    expect(fabButton().props.accessibilityState.disabled).toBe(true);

    fireEvent.press(fabButton());
    expect(onPrimaryFabPress).not.toHaveBeenCalled();
  });

  it('saves normally and routes press to onPrimaryFabPress when the form is valid', () => {
    const onPrimaryFabPress = jest.fn();
    const onErrorSummaryPress = jest.fn();
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={true}
        errorCount={0}
        onPrimaryFabPress={onPrimaryFabPress}
        onErrorSummaryPress={onErrorSummaryPress}
      />,
    );
    expect(screen.getByText('Save Product')).toBeOnTheScreen();

    fireEvent.press(fabButton());
    expect(onPrimaryFabPress).toHaveBeenCalledTimes(1);
    expect(onErrorSummaryPress).not.toHaveBeenCalled();
  });
});

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

  it('bumps its floating offset by BOTTOM_NAV_CLEARANCE on web when BottomNav is visible', () => {
    mockPlatform('web');
    mockUseBreakpoint.mockReturnValue({ isMd });
    const { rerender } = render(<ProductFabControls {...baseProps} />);
    const hiddenBottom = dockedBottom();

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ProductFabControls {...baseProps} />);

    expect(dockedBottom() - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  it('adds no clearance on native, where the tab bar is in normal flow', () => {
    mockPlatform('ios');
    mockUseBreakpoint.mockReturnValue({ isMd });
    const { rerender } = render(<ProductFabControls {...baseProps} />);
    const hiddenBottom = dockedBottom();

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ProductFabControls {...baseProps} />);

    expect(dockedBottom()).toBe(hiddenBottom);
  });
});
