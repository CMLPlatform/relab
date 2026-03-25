import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useRouter } from 'expo-router';
import ForgotPasswordScreen from '../forgot-password';
import { renderWithProviders } from '@/test-utils';
import { server } from '@/test-utils/server';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

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
    renderWithProviders(<ForgotPasswordScreen />);
    expect(screen.getByText('Forgot Password')).toBeTruthy();
    expect(screen.getByText('Send Reset Link')).toBeTruthy();
  });

  it('does not submit when email is empty', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Send Reset Link'));
    // No success or error message should appear — the form guards against empty email
    expect(screen.queryByText(/If an account exists/)).toBeNull();
  });

  it('shows success message after successful submission', async () => {
    server.use(http.post(`${API_URL}/auth/forgot-password`, () => HttpResponse.json({}, { status: 200 })));
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText(/If an account exists/)).toBeTruthy();
    });
  });

  it('shows error message on failed fetch', async () => {
    server.use(
      http.post(`${API_URL}/auth/forgot-password`, () =>
        HttpResponse.json({ detail: 'User not found' }, { status: 400 }),
      ),
    );
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'notfound@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeTruthy();
    });
  });

  it('shows generic error when fetch throws', async () => {
    server.use(http.post(`${API_URL}/auth/forgot-password`, () => HttpResponse.error()));
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText(/An error occurred/)).toBeTruthy();
    });
  });

  it('Back to Login in the success state calls router.push("/login")', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
    server.use(http.post(`${API_URL}/auth/forgot-password`, () => HttpResponse.json({}, { status: 200 })));
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    fireEvent.press(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText(/If an account exists/)).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('back to login button calls router.back', () => {
    const mockBack = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: mockBack,
      setParams: jest.fn(),
    });
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockBack).toHaveBeenCalled();
  });
});
