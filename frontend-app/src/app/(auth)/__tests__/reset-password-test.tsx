import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ResetPasswordScreen from '../reset-password';
import { renderWithProviders } from '@/test-utils';
import { server } from '@/test-utils/server';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

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
    renderWithProviders(<ResetPasswordScreen />);
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
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('password-input'), 'somepassword');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText('No reset token provided')).toBeTruthy();
    });
  });

  it('shows success message on successful reset', async () => {
    server.use(http.post(`${API_URL}/auth/reset-password`, () => HttpResponse.json({}, { status: 200 })));
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('password-input'), 'newpassword123');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText(/Password reset successful/)).toBeTruthy();
    });
  });

  it('shows error on failed reset', async () => {
    server.use(
      http.post(`${API_URL}/auth/reset-password`, () =>
        HttpResponse.json({ detail: 'Token expired or invalid' }, { status: 400 }),
      ),
    );
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('password-input'), 'newpassword123');
    pressResetButton();
    await waitFor(() => {
      expect(screen.getByText('Token expired or invalid')).toBeTruthy();
    });
  });

  it('shows generic error when fetch throws', async () => {
    server.use(http.post(`${API_URL}/auth/reset-password`, () => HttpResponse.error()));
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('password-input'), 'newpassword123');
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
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
