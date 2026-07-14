import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductFabControls } from '@/components/product/detail/FabControls';

jest.mock('react-native-paper', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const actual = jest.requireActual<typeof import('react-native-paper')>('react-native-paper');
  return {
    ...actual,
    AnimatedFAB: ({
      label,
      disabled,
      visible,
      onPress,
    }: {
      label?: string;
      disabled?: boolean;
      visible?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        Text,
        {
          testID: 'primary-fab',
          // A no-op wrapper (not `undefined`) mirrors the real AnimatedFAB/Pressable
          // gating the press internally — RNTL's fireEvent bubbles to find a handler,
          // and an `undefined` onPress here would still find the un-gated `onPress`
          // prop on this element's own AnimatedFAB(...) call one level up.
          onPress: () => {
            if (!disabled) onPress?.();
          },
        },
        `${label}|disabled=${disabled ? 'true' : 'false'}|visible=${visible ? 'true' : 'false'}`,
      ),
    Tooltip: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, [
        React.createElement(Text, { key: 'tooltip', testID: 'tooltip' }, title),
        children,
      ]),
  };
});

jest.mock('@/components/cameras/CameraStreamPicker', () => ({
  CameraStreamPicker: () => null,
}));

const DISABLED_FALSE = /disabled=false/;
const DISABLED_TRUE = /disabled=true/;
const EDIT_COMPONENT_PATTERN = /Edit Component/;
const TWO_ERRORS_LABEL = /^2 fields need attention\|/;
const ONE_ERROR_LABEL = /^1 field needs attention\|/;
const SAVE_PRODUCT_LABEL = /^Save Product\|/;

const baseProps = {
  entityRole: 'product' as const,
  editMode: false,
  ownedByMe: true,
  productName: 'Test',
  fabExtended: true,
  validationValid: true,
  isSaving: false,
  isDirty: false,
  isNew: false,
  onPrimaryFabPress: jest.fn(),
  streamPickerVisible: false,
  onDismissStreamPicker: jest.fn(),
  primaryFabIcon: 'pencil' as const,
};

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
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(DISABLED_FALSE);
    // No tooltip because we're not actually trying to save
    expect(screen.queryByTestId('tooltip')).toBeNull();
  });

  // Invalid with no known error count (errorCount unset) has no error summary
  // to route to, so the FAB blocks the save outright; the tooltip explains why.
  // Once errorCount is known and > 0, the FAB stays pressable to route to the
  // error summary instead (see the errorCount describe block).
  it('disables the FAB but shows the validation tooltip when dirty edits are invalid with no known error count', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isDirty={true}
        validationValid={false}
        validationError="Name is required"
      />,
    );
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(DISABLED_TRUE);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Name is required');
  });

  it('enables the FAB when dirty edits are valid', () => {
    render(
      <ProductFabControls {...baseProps} editMode={true} isDirty={true} validationValid={true} />,
    );
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(DISABLED_FALSE);
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
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(DISABLED_TRUE);
  });

  // Same rationale as the dirty-edits case above: no known error count means
  // no error summary to route to, so the FAB blocks the save instead.
  it('disables the FAB for a new product with no edits when validation fails and error count is unknown', () => {
    render(
      <ProductFabControls
        {...baseProps}
        editMode={true}
        isNew={true}
        isDirty={false}
        validationValid={false}
        validationError="Name is required"
      />,
    );
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(DISABLED_TRUE);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Name is required');
  });

  it('enables the FAB in view mode (validation is irrelevant)', () => {
    render(<ProductFabControls {...baseProps} editMode={false} validationValid={false} />);
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(DISABLED_FALSE);
  });

  it('uses component labels for component pages', () => {
    render(<ProductFabControls {...baseProps} entityRole="component" editMode={false} />);
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(EDIT_COMPONENT_PATTERN);
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
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(TWO_ERRORS_LABEL);
    expect(fab).toHaveTextContent(DISABLED_FALSE);

    fireEvent.press(fab);
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
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(ONE_ERROR_LABEL);
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
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(DISABLED_TRUE);

    fireEvent.press(fab);
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
    const fab = screen.getByTestId('primary-fab');
    expect(fab).toHaveTextContent(SAVE_PRODUCT_LABEL);

    fireEvent.press(fab);
    expect(onPrimaryFabPress).toHaveBeenCalledTimes(1);
    expect(onErrorSummaryPress).not.toHaveBeenCalled();
  });
});
