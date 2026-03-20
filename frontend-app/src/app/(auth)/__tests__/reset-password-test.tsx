import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ResetPasswordScreen from '../reset-password';

global.fetch = jest.fn() as jest.Mock;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-reset-token' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the Reset Password form', () => {
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    const elements = screen.getAllByText('Reset Password');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  const pressResetButton = () => {
    // There are two "Reset Password" texts: heading + button. Press the button (last one).
    const buttons = screen.getAllByText('Reset Password');
    fireEvent.press(buttons[buttons.length - 1]);
  };

  it('shows error when no token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'somepassword');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText('No reset token provided')).toBeTruthy();
    });
  });

  it('shows success message on successful reset', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'newpassword123');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText(/Password reset successful/)).toBeTruthy();
    });
  });

  it('shows error on failed reset', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Token expired or invalid' }),
    });
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'newpassword123');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText('Token expired or invalid')).toBeTruthy();
    });
  });

  it('shows generic error when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    const input = screen.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    fireEvent.changeText(input, 'newpassword123');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText(/An error occurred during password reset/)).toBeTruthy();
    });
  });

  it('Back to Login button navigates to login', () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
    render(
      <Wrapper>
        <ResetPasswordScreen />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
