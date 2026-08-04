import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { FormFieldError } from '@/components/base/FormField';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

describe('FormFieldError', () => {
  it('renders nothing when there is no message', () => {
    renderWithProviders(<FormFieldError errorId="field-error" message={undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the message with a matching nativeID for describedBy linkage', () => {
    renderWithProviders(<FormFieldError errorId="field-error" message="Required" />);
    const errorText = screen.getByText('Required');
    expect(errorText).toBeOnTheScreen();
    expect(errorText.props.nativeID).toBe('field-error');
  });
});
