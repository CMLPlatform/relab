import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
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
    }: {
      label?: string;
      disabled?: boolean;
      visible?: boolean;
    }) =>
      React.createElement(
        Text,
        { testID: 'primary-fab' },
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

const baseProps = {
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
    expect(fab).toHaveTextContent(/disabled=false/);
    // No tooltip because we're not actually trying to save
    expect(screen.queryByTestId('tooltip')).toBeNull();
  });

  it('disables the FAB and shows the validation tooltip when dirty edits are invalid', () => {
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
    expect(fab).toHaveTextContent(/disabled=true/);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Name is required');
  });

  it('enables the FAB when dirty edits are valid', () => {
    render(
      <ProductFabControls {...baseProps} editMode={true} isDirty={true} validationValid={true} />,
    );
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(/disabled=false/);
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
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(/disabled=true/);
  });

  it('enables the FAB in view mode (validation is irrelevant)', () => {
    render(<ProductFabControls {...baseProps} editMode={false} validationValid={false} />);
    expect(screen.getByTestId('primary-fab')).toHaveTextContent(/disabled=false/);
  });
});
