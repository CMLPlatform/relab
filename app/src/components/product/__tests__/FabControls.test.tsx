import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductFabControls } from '@/components/product/detail/FabControls';

jest.mock('@/components/cameras/CameraStreamPicker', () => ({
  CameraStreamPicker: () => null,
}));

const baseProps = {
  entityRole: 'product' as const,
  editMode: false,
  ownedByMe: true,
  productName: 'Test',
  fabExtended: true,
  validationValid: true,
  isSaving: false,
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
  it('disables the FAB but offers the validation tooltip when dirty edits are invalid with no known error count', () => {
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
    fireEvent(screen.getByTestId('fab-tooltip-trigger'), 'pressIn');
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Name is required');
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
    expect(fabButton().props.accessibilityState.disabled).toBe(false);

    fireEvent.press(fabButton());
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
