import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
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

  it('keeps the alert role and fades rather than popping in', () => {
    renderWithProviders(<FormFieldError errorId="field-error" message="Required" />);
    // The role has to survive the move to Animated.Text — it is what announces
    // the error, and the fade is worthless if it costs the announcement.
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    const errorText = screen.getByText('Required');
    expect(errorText.props.entering).toBeDefined();
    expect(errorText.props.exiting).toBeDefined();
  });

  // accessibilityRole="alert" alone announces nothing on Android or the web
  // export — the node has to be a live region. A validation error that appears
  // after the fact is otherwise silent for anyone not looking at the field.
  it('marks the error as a polite live region', () => {
    renderWithProviders(<FormFieldError errorId="field-error" message="Required" />);
    expect(screen.getByText('Required').props.accessibilityLiveRegion).toBe('polite');
  });

  it('announces the error explicitly on iOS, where VoiceOver ignores live regions', () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');

    const { rerender } = renderWithProviders(
      <FormFieldError errorId="field-error" message={undefined} />,
    );
    // Ignore whatever the shared render providers announce on mount; this
    // asserts on the transition into an error.
    announce.mockClear();

    rerender(<FormFieldError errorId="field-error" message="Required" />);
    expect(announce).toHaveBeenCalledWith('Required');

    announce.mockClear();
    rerender(<FormFieldError errorId="field-error" message="Required" />);
    expect(announce).not.toHaveBeenCalled();

    platform.restore();
    announce.mockRestore();
  });
});
