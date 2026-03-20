import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import ForgotPasswordScreen from '../forgot-password';

global.fetch = jest.fn() as jest.Mock;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the forgot password form', () => {
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    expect(screen.getByText('Forgot Password')).toBeTruthy();
    expect(screen.getByText('Send Reset Link')).toBeTruthy();
  });

  it('fetch is not called when email is empty and button is pressed', () => {
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Send Reset Link'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows success message after successful submission', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText(/If an account exists/)).toBeTruthy();
    });
  });

  it('shows error message on failed fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'User not found' }),
    });
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'notfound@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeTruthy();
    });
  });

  it('shows generic error when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText(/An error occurred/)).toBeTruthy();
    });
  });

  it('back to login button calls router.back', () => {
    const mockBack = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: mockBack,
      setParams: jest.fn(),
    });
    render(
      <Wrapper>
        <ForgotPasswordScreen />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockBack).toHaveBeenCalled();
  });
});
